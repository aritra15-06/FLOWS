from fastapi import APIRouter, Request
from typing import Optional
import json
import os

from gis.impact_engine import compute_impact

router = APIRouter()

@router.get("/impact/{location_id}")
def get_impact(location_id: str, request: Request, lat: Optional[float] = None, lon: Optional[float] = None, radius: Optional[float] = 6500.0):
    ps = getattr(request.app.state, "prediction_service", None)
    
    target_lat = lat
    target_lon = lon

    if target_lat is None or target_lon is None:
        target_lat, target_lon = 27.5, 88.6
        if ps and location_id in ps.locations:
            loc = ps.locations[location_id]
            target_lat = loc.get("latitude", 27.5)
            target_lon = loc.get("longitude", 88.6)
        elif ps:
            for k, v in ps.locations.items():
                if str(k).upper() == str(location_id).upper():
                    target_lat = v.get("latitude", 27.5)
                    target_lon = v.get("longitude", 88.6)
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

    impact = compute_impact(target_lat, target_lon, radius, villages, roads, bridges)
    return impact
