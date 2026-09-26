import json
from datetime import datetime, timezone

def generate_cap_alert(identifier: str, sender: str, msg_type: str, status: str, scope: str,
                       event: str, urgency: str, severity: str, certainty: str, headline: str,
                       description: str, instruction: str) -> dict:
    return {
        "identifier": identifier,
        "sender": sender,
        "sent": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "msgType": msg_type,
        "scope": scope,
        "info": {
            "category": "Met",
            "event": event,
            "urgency": urgency,
            "severity": severity,
            "certainty": certainty,
            "headline": headline,
            "description": description,
            "instruction": instruction
        }
    }
