from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class CompoundRequest(BaseModel):
    location_id: str
    ls_prob: Optional[float] = None
    flood_prob: Optional[float] = None
    rainfall_24h_mm: Optional[float] = 65.0

@router.post("/compound")
def compound_hazard(req: CompoundRequest, request: Request):
    ps = getattr(request.app.state, "prediction_service", None)
    if ps:
        pred = ps.predict_with_overrides(req.location_id, {
            "rainfall_24h_mm": req.rainfall_24h_mm
        })
        cp = pred["prediction"]["hazards"]["compound"]
        return {
            "location_id": req.location_id,
            "compound_score": cp["probability"],
            "coupling_active": cp["coupling_active"],
            "pathway_code": cp["pathway_code"],
            "activated_pathways": cp["activated_pathways"],
            "summary": cp["summary"]
        }
    return {
        "assessment": "High risk of cascade: Landslide blocking river leading to flash flood surge.",
        "pathway_codes": ["RAINFALL_SLOPE_BANK", "LANDSLIDE_CHANNEL_BLOCK"],
        "coupling_active": True
    }
