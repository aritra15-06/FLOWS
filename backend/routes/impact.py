from fastapi import APIRouter, Request
import json
import os

from gis.impact_engine import compute_impact

router = APIRouter()

@router.get("/impact/{location_id}")
def get_impact(location_id: str, request: Request):
    ps = getattr(request.app.state, "prediction_service", None)
    lat, lon = 27.5, 88.6
    
    if ps and location_id in ps.locations:
        loc = ps.locations[location_id]
        lat = loc.get("latitude", 27.5)
        lon = loc.get("longitude", 88.6)
    else:
        # Try finding case-insensitively
        if ps:
            for k, v in ps.locations.items():
                if str(k).upper() == str(location_id).upper():
                    lat = v.get("latitude", 27.5)
                    lon = v.get("longitude", 88.6)
                    break

    seed_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "seed")
    villages, roads, bridges = [], [], []

    try:
        with open(os.path.join(seed_dir, "villages_north_sikkim.json"), "r", encoding="utf-8") as f:
            villages = json.load(f)
    except Exception:
        pass

    try:
        with open(os.path.join(seed_dir, "roads_north_sikkim.json"), "r", encoding="utf-8") as f:
            roads = json.load(f)
    except Exception:
        pass

    try:
        with open(os.path.join(seed_dir, "bridges_north_sikkim.json"), "r", encoding="utf-8") as f:
            bridges = json.load(f)
    except Exception:
        pass

    impact = compute_impact(lat, lon, 3000.0, villages, roads, bridges)
    return impact
