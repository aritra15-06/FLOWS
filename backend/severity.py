from pydantic import BaseModel
from typing import List, Dict

class SeverityResult(BaseModel):
    score_0_100: float
    band: str
    components: Dict[str, float]

def compute_severity(fos: float, slip_depth_m: float, slope_deg: float, rainfall_1h: float, rainfall_24h: float) -> SeverityResult:
    # Weight factors
    fos_score = max(0, (1.5 - fos) * 50) if fos < 1.5 else 0
    depth_score = min(20, slip_depth_m * 4)
    slope_score = min(15, (slope_deg / 45) * 15)
    rain_score = min(15, (rainfall_24h / 200) * 15)
    
    total = min(100.0, fos_score + depth_score + slope_score + rain_score)
    
    band = "MINOR"
    if total >= 75:
        band = "CATASTROPHIC"
    elif total >= 50:
        band = "MAJOR"
    elif total >= 25:
        band = "MODERATE"
        
    return SeverityResult(
        score_0_100=round(total, 1),
        band=band,
        components={
            "fos_contribution": round(fos_score, 1),
            "depth_contribution": round(depth_score, 1),
            "slope_contribution": round(slope_score, 1),
            "rain_contribution": round(rain_score, 1)
        }
    )
