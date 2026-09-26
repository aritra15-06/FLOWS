from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter()

class SimulateRequest(BaseModel):
    location_id: str
    overrides: Dict[str, float] = {}

@router.post("/simulate")
def simulate_location(req: SimulateRequest, request: Request):
    ps = getattr(request.app.state, "prediction_service", None)
    if not ps:
        from service.prediction_service import PredictionService
        ps = PredictionService.load_default()
        request.app.state.prediction_service = ps

    if req.location_id not in ps.locations:
        found = False
        for k in ps.locations.keys():
            if str(k).upper() == str(req.location_id).upper():
                req.location_id = k
                found = True
                break
        if not found:
            first_key = next(iter(ps.locations.keys()), "LOC01")
            req.location_id = first_key

    result = ps.predict_with_overrides(req.location_id, req.overrides)
    return result
