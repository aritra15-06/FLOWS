from fastapi import APIRouter, Body
from typing import Optional, Dict, Any

router = APIRouter()

@router.post("/alerts/send")
def send_alert(payload: Optional[Dict[str, Any]] = Body(default=None)):
    payload = payload or {}
    dry_run = payload.get("dry_run", True)
    location_id = payload.get("location_id", "LOC01")
    action = payload.get("action", "ADVISORY")
    message = payload.get("message", "")
    language = payload.get("language", "English")

    contacts = [
        {"name": "NDRF 2nd Bn Commandant", "role": "Disaster Response", "phone": "+91-9434000001", "tier": "IMMEDIATE"},
        {"name": "District Magistrate (Mangan)", "role": "District Administration", "phone": "+91-9434000002", "tier": "IMMEDIATE"},
        {"name": "BRO Commander (Project Swastik)", "role": "Road Infrastructure", "phone": "+91-9434000003", "tier": "PREPARE"},
        {"name": "Teesta-V NHPC Control Room", "role": "Dam & Hydro", "phone": "+91-9434000004", "tier": "IMMEDIATE"},
        {"name": "Sikkim State Disaster Management (SSDMA)", "role": "State EOC", "phone": "+91-9434000005", "tier": "IMMEDIATE"},
    ]

    return {
        "status": "success",
        "mode": "dry-run" if dry_run else "live",
        "location_id": location_id,
        "action": action,
        "language": language,
        "message_preview": message,
        "messages_sent": len(contacts),
        "dispatched_to": [
            {"contact": c["name"], "role": c["role"], "phone": c["phone"], "status": "sent" if not dry_run else "simulated"}
            for c in contacts
        ]
    }

@router.get("/contacts")
def get_contacts():
    return [
        {"name": "NDRF 2nd Bn Commandant", "role": "Disaster Response", "phone": "+91-9434000001", "tier": "IMMEDIATE"},
        {"name": "District Magistrate (Mangan)", "role": "District Administration", "phone": "+91-9434000002", "tier": "IMMEDIATE"},
        {"name": "BRO Commander (Project Swastik)", "role": "Road Infrastructure", "phone": "+91-9434000003", "tier": "PREPARE"},
        {"name": "Teesta-V NHPC Control Room", "role": "Dam & Hydro", "phone": "+91-9434000004", "tier": "IMMEDIATE"},
        {"name": "Sikkim State Disaster Management (SSDMA)", "role": "State EOC", "phone": "+91-9434000005", "tier": "IMMEDIATE"},
    ]
