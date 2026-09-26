from pydantic import BaseModel

class ActionResult(BaseModel):
    level: str
    citizen_message: str
    responder_action: str

def decide_action(calibrated_probability: float, severity_band: str, confidence_band: str) -> ActionResult:
    # Basic decision grid
    level = "ADVISORY"
    msg = "Stay tuned for updates."
    resp = "Monitor situation."
    
    if calibrated_probability > 0.8:
        if severity_band in ["MAJOR", "CATASTROPHIC"]:
            level = "EMERGENCY"
            msg = "EVACUATE IMMEDIATELY to higher ground."
            resp = "Deploy NDRF, close roads."
        else:
            level = "WARNING"
            msg = "Be prepared to evacuate. Move away from steep slopes."
            resp = "Alert local response teams."
    elif calibrated_probability > 0.5:
        level = "WATCH"
        msg = "Conditions are favorable for hazards. Exercise caution."
        resp = "Pre-position assets."
        
    # Cap confidence
    if confidence_band == "LOW" and level in ["WARNING", "EMERGENCY"]:
        level = "WATCH"
        msg = "Uncertain conditions. Stay alert."
        resp = "Gather more data."
        
    return ActionResult(level=level, citizen_message=msg, responder_action=resp)
