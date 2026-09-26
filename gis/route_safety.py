from typing import List, Dict

def evaluate_route_safety(roads: List[Dict], hazard_polygons: List[Dict]) -> List[Dict]:
    route_states = []
    for r in roads:
        # Mock logic
        state = "OPEN"
        if r.get("name") == "NH-10":
            state = "BLOCKED"
        elif r.get("name") == "SH-1":
            state = "CAUTION"
            
        route_states.append({
            "road_id": r.get("id"),
            "name": r.get("name"),
            "state": state
        })
    return route_states
