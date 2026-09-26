from fastapi import APIRouter, Request
import json
import os

router = APIRouter()

TYPOLOGY_MAP = {
    "LOC01": "COMPOUND",
    "LOC02": "COMPOUND",
    "LOC03": "LANDSLIDE_ONLY",
    "LOC04": "LANDSLIDE_ONLY",
    "LOC05": "FLOOD_ONLY",
    "LOC06": "FLOOD_ONLY",
}

@router.get("/locations")
def get_locations(request: Request):
    ps = getattr(request.app.state, "prediction_service", None)
    if ps and ps.locations:
        locs = []
        for loc_id, loc in ps.locations.items():
            latitude = loc.get("latitude", 27.5)
            longitude = loc.get("longitude", 88.6)
            lid = loc.get("location_id", loc_id)
            locs.append({
                "id": lid,
                "location_id": lid,
                "name": loc.get("name", loc_id),
                "lat": latitude,
                "lng": longitude,
                "lon": longitude,
                "latitude": latitude,
                "longitude": longitude,
                "elevation_m": loc.get("elevation_m", 1500),
                "catchment_area_km2": loc.get("catchment_area_km2", 30.0),
                "primary_road": loc.get("primary_road", "NH-10"),
                "hazard_focus": loc.get("hazard_focus", "compound"),
                "hazard_typology": loc.get("hazard_typology", TYPOLOGY_MAP.get(lid, "COMPOUND")),
                "params": loc.get("params", {}),
            })
        return locs

    # Fallback to direct file read
    seed_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "seed", "pilot_catchments.json")
    if os.path.exists(seed_file):
        with open(seed_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            raw_list = data if isinstance(data, list) else data.get("locations", list(data.values()))
            res = []
            for item in raw_list:
                lat = item.get("latitude", item.get("lat", 27.5))
                lng = item.get("longitude", item.get("lon", item.get("lng", 88.6)))
                res.append({
                    **item,
                    "id": item.get("location_id", item.get("id")),
                    "location_id": item.get("location_id", item.get("id")),
                    "lat": lat,
                    "lng": lng,
                    "lon": lng,
                    "latitude": lat,
                    "longitude": lng,
                })
            return res

    return []
