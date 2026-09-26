def validate_prediction_json(data):
    """Prediction JSON contract v1.0.0"""
    required_keys = ["schema_version", "location_id", "timestamp", "hazards", "confidence"]
    for key in required_keys:
        if key not in data:
            raise ValueError(f"Missing required key: {key}")
            
    if data.get("schema_version") != "1.0.0":
        raise ValueError("Invalid schema version")
        
    return True

def create_base_prediction():
    return {
        "schema_version": "1.0.0",
        "location_id": None,
        "timestamp": None,
        "hazards": {
            "landslide": {},
            "flood": {},
            "compound": {}
        },
        "confidence": {},
        "severity": "SAFE"
    }
