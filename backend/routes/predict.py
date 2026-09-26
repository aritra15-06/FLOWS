from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()

class PredictRequest(BaseModel):
    location_id: str

@router.post("/predict")
def predict_location(req: PredictRequest, request: Request):
    ps = getattr(request.app.state, "prediction_service", None)
    if not ps:
        from service.prediction_service import PredictionService
        ps = PredictionService.load_default()
        request.app.state.prediction_service = ps

    if req.location_id not in ps.locations:
        # Check if locations has numeric or string keys or look by id
        found = False
        for k in ps.locations.keys():
            if str(k).upper() == str(req.location_id).upper():
                req.location_id = k
                found = True
                break
        if not found:
            # Fall back to first location
            first_key = next(iter(ps.locations.keys()), "LOC01")
            req.location_id = first_key

    result = ps.predict_location(req.location_id)
    return result
