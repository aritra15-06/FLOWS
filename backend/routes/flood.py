from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class FloodRequest(BaseModel):
    location_id: str
    rainfall_24h_mm: Optional[float] = 65.0
    rainfall_1h_mm: Optional[float] = 15.0

@router.post("/flood/predict")
def predict_flood(req: FloodRequest, request: Request):
    ps = getattr(request.app.state, "prediction_service", None)
    if ps:
        pred = ps.predict_with_overrides(req.location_id, {
            "rainfall_24h_mm": req.rainfall_24h_mm,
            "rainfall_1h_mm": req.rainfall_1h_mm
        })
        fl = pred["prediction"]["hazards"]["flood"]
        return {
            "location_id": req.location_id,
            "flood_probability": fl["probability"],
            "peak_discharge_m3s": fl["peak_discharge_m3s"],
            "direct_runoff_mm": fl["runoff_mm"],
            "arrival_time_hrs": fl["arrival_time_hours"],
            "inundation_depth_m": fl["inundation_depth_m"],
            "drivers": fl.get("drivers", []),
            "routing": "Teesta River Valley (Muskingum-Cunge)"
        }
    return {
        "location_id": req.location_id,
        "flood_probability": min(1.0, req.rainfall_24h_mm / 250.0),
        "peak_discharge_m3s": 125.0,
        "direct_runoff_mm": req.rainfall_24h_mm * 0.45,
        "arrival_time_hrs": 2.2,
        "inundation_depth_m": 1.8,
        "routing": "Teesta River Valley"
    }
