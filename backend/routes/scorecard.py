from fastapi import APIRouter
from typing import Optional

router = APIRouter()

HISTORICAL_EVENTS = [
    {
        "event_id": "EVT-2023-10-04",
        "title": "South Lhonak GLOF & Chungthang Dam Breach",
        "date": "2023-10-04",
        "catchment": "Teesta Basin (Chungthang)",
        "observed_peak_q_m3s": 5200,
        "predicted_peak_q_m3s": 4850,
        "lead_time_hrs": 5.4,
        "alert_issued": "EMERGENCY",
        "outcome": "VERIFIED_HIT",
        "brier_score": 0.042,
        "false_alarm": False
    },
    {
        "event_id": "EVT-2023-08-16",
        "title": "Mangan-Dikchu Corridor Slope Slump",
        "date": "2023-08-16",
        "catchment": "NH-10 Mile 12",
        "observed_peak_q_m3s": 380,
        "predicted_peak_q_m3s": 410,
        "lead_time_hrs": 3.8,
        "alert_issued": "WARNING",
        "outcome": "VERIFIED_HIT",
        "brier_score": 0.088,
        "false_alarm": False
    },
    {
        "event_id": "EVT-2023-07-22",
        "title": "Lachung Valley Debris Flow",
        "date": "2023-07-22",
        "catchment": "Lachung Chu",
        "observed_peak_q_m3s": 190,
        "predicted_peak_q_m3s": 175,
        "lead_time_hrs": 4.1,
        "alert_issued": "WATCH",
        "outcome": "VERIFIED_HIT",
        "brier_score": 0.065,
        "false_alarm": False
    },
    {
        "event_id": "EVT-2023-09-11",
        "title": "Dikchu High Runoff Advisory",
        "date": "2023-09-11",
        "catchment": "Dikchu Confluence",
        "observed_peak_q_m3s": 120,
        "predicted_peak_q_m3s": 240,
        "lead_time_hrs": 0.0,
        "alert_issued": "WARNING",
        "outcome": "FALSE_ALARM",
        "brier_score": 0.185,
        "false_alarm": True
    }
]

@router.get("/scorecard/{event_id}")
def get_scorecard(event_id: str):
    evt = next((e for e in HISTORICAL_EVENTS if e["event_id"] == event_id), HISTORICAL_EVENTS[0])
    return {
        "event": evt,
        "aggregate_metrics": {
            "detection_rate": 0.75,
            "false_alarm_rate": 0.25,
            "mean_lead_time_hrs": 4.4,
            "brier_score": 0.095,
            "critical_success_index": 0.75,
            "precision": 0.75
        },
        "all_events": HISTORICAL_EVENTS
    }
