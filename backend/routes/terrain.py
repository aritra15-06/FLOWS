import os
import json
import time
import urllib.request
import urllib.parse
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_FILE = os.path.join(BASE_DIR, "data", "sikkim_satellite_dem_cache.json")

# In-memory cached DEM structure
_SATELLITE_DEM_CACHE = None
_LAST_CACHE_FETCH = 0
_CACHE_TTL = 3600  # 1 hour live refresh TTL

def load_cached_dem():
    """Loads the pre-fetched satellite DEM from disk."""
    global _SATELLITE_DEM_CACHE, _LAST_CACHE_FETCH
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                _SATELLITE_DEM_CACHE = json.load(f)
                _LAST_CACHE_FETCH = _SATELLITE_DEM_CACHE.get("last_updated", time.time())
                return _SATELLITE_DEM_CACHE
        except Exception as e:
            print(f"[TERRAIN] Error loading DEM cache: {e}")
    return None

def fetch_live_satellite_elevation(locations: list):
    """
    Queries live satellite elevation over the internet.
    Primary: Open-Elevation SRTM REST API (batch capability)
    Secondary: Open-Meteo Copernicus DEM API
    """
    # Try Open-Elevation first (supports up to 1000 coordinates in POST)
    try:
        payload = json.dumps({"locations": locations}).encode("utf-8")
        req = urllib.request.Request(
            "https://api.open-elevation.com/api/v1/lookup",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "FLOWS-Terrain3D-Satellite/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=12) as res:
            if res.status == 200:
                data = json.loads(res.read().decode("utf-8"))
                return [r["elevation"] for r in data.get("results", [])]
    except Exception as oe_err:
        print(f"[TERRAIN] Open-Elevation query note: {oe_err}")

    # Fallback: Open-Meteo (chunks of 100 coordinates)
    try:
        elevations = []
        batch_size = 100
        for i in range(0, len(locations), batch_size):
            chunk = locations[i:i + batch_size]
            lats = [loc["latitude"] for loc in chunk]
            lngs = [loc["longitude"] for loc in chunk]
            payload = json.dumps({"latitude": lats, "longitude": lngs}).encode("utf-8")
            req = urllib.request.Request(
                "https://api.open-meteo.com/v1/elevation",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "FLOWS-Terrain3D-Satellite/1.0"
                }
            )
            with urllib.request.urlopen(req, timeout=10) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8"))
                    elevations.extend(data.get("elevation", []))
            time.sleep(0.15)
        if len(elevations) == len(locations):
            return elevations
    except Exception as om_err:
        print(f"[TERRAIN] Open-Meteo query note: {om_err}")

    return None

@router.get("/terrain/live")
def get_live_terrain(force_refresh: bool = False):
    """
    Returns the real satellite digital elevation model (DEM) for the Sikkim Teesta corridor,
    including station positions, satellite heights, and the real OSM Teesta river polyline.
    Fetches directly from satellite elevation APIs over the internet.
    """
    global _SATELLITE_DEM_CACHE, _LAST_CACHE_FETCH

    cached = load_cached_dem()
    now = time.time()

    # If force_refresh or cache is older than TTL, attempt live internet fetch
    is_live = False
    if force_refresh or cached is None or (now - _LAST_CACHE_FETCH > _CACHE_TTL):
        grid_size = 25
        min_lat, max_lat = 27.10, 27.75
        min_lng, max_lng = 88.35, 88.85
        pts = []
        for i in range(grid_size):
            lat = round(max_lat - i * (max_lat - min_lat) / (grid_size - 1), 5)
            for j in range(grid_size):
                lng = round(min_lng + j * (max_lng - min_lng) / (grid_size - 1), 5)
                pts.append({"latitude": lat, "longitude": lng})

        live_elevations = fetch_live_satellite_elevation(pts)
        if live_elevations and len(live_elevations) == len(pts):
            print(f"[TERRAIN] Successfully fetched {len(live_elevations)} live satellite DEM points from internet!")
            if cached is None:
                cached = {}
            cached["grid_size"] = grid_size
            cached["bbox"] = {"minLat": min_lat, "maxLat": max_lat, "minLng": min_lng, "maxLng": max_lng}
            cached["elevations"] = live_elevations
            cached["min_elevation"] = min(live_elevations)
            cached["max_elevation"] = max(live_elevations)
            cached["last_updated"] = now
            cached["source"] = "SRTM / Copernicus 90m Live Satellite DEM"
            _SATELLITE_DEM_CACHE = cached
            _LAST_CACHE_FETCH = now
            is_live = True

            # Persist updated cache
            try:
                with open(CACHE_FILE, "w", encoding="utf-8") as f:
                    json.dump(cached, f, indent=2)
            except Exception as e:
                print(f"[TERRAIN] Failed writing cache update: {e}")

    if _SATELLITE_DEM_CACHE is None:
        raise HTTPException(status_code=500, detail="Satellite DEM data unavailable")

    response_data = dict(_SATELLITE_DEM_CACHE)
    response_data["is_live"] = is_live
    response_data["status"] = "success"
    return response_data

class LocationQuery(BaseModel):
    latitude: float
    longitude: float

class ElevationLookupRequest(BaseModel):
    locations: List[LocationQuery]

@router.post("/terrain/elevation-lookup")
def lookup_elevation(req: ElevationLookupRequest):
    """Lookup real satellite elevation for any arbitrary coordinates."""
    locs = [{"latitude": l.latitude, "longitude": l.longitude} for l in req.locations]
    elevs = fetch_live_satellite_elevation(locs)
    if elevs:
        return {"status": "success", "elevations": elevs, "source": "Live Satellite Elevation"}
    
    # Fallback to local DEM nearest-neighbor interpolation
    cached = load_cached_dem()
    if cached and "elevations" in cached:
        bbox = cached["bbox"]
        grid = cached["grid_size"]
        elevations = cached["elevations"]
        results = []
        for l in req.locations:
            lat_f = (bbox["maxLat"] - l.latitude) / (bbox["maxLat"] - bbox["minLat"])
            lng_f = (l.longitude - bbox["minLng"]) / (bbox["maxLng"] - bbox["minLng"])
            row = max(0, min(grid - 1, round(lat_f * (grid - 1))))
            col = max(0, min(grid - 1, round(lng_f * (grid - 1))))
            idx = row * grid + col
            results.append(elevations[idx] if 0 <= idx < len(elevations) else 800.0)
        return {"status": "success", "elevations": results, "source": "Interpolated Satellite DEM"}

    return {"status": "fallback", "elevations": [800.0] * len(req.locations)}
