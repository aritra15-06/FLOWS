from pydantic import BaseModel
from typing import List

class ConfidenceResult(BaseModel):
    confidence_0_1: float
    confidence_band: str
    reasons: List[str]

def assemble_confidence(prediction_json: dict) -> ConfidenceResult:
    # A simple mock logic to combine data quality, validity, decisiveness
    # In reality, this would evaluate data staleness, probability margins, etc.
    score = 0.8
    reasons = ["Good data quality", "Probability decisiveness high", "Physics validity passing"]
    
    # Check if prediction margin is low
    prob = prediction_json.get("probability", 0.5)
    if 0.4 < prob < 0.6:
        score -= 0.3
        reasons.append("Probability close to decision boundary")

    band = "HIGH"
    if score < 0.4:
        band = "LOW"
    elif score < 0.7:
        band = "MEDIUM"

    return ConfidenceResult(
        confidence_0_1=round(score, 2),
        confidence_band=band,
        reasons=reasons
    )
