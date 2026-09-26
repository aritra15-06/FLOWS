import math
from typing import List, Dict, Any
# Shapely and pyproj would be imported here in a real scenario
# from shapely.geometry import Point
# import pyproj

def compute_impact(hazard_lat: float, hazard_lon: float, hazard_radius_m: float, villages: List[Dict], roads: List[Dict], bridges: List[Dict]) -> Dict[str, Any]:
    # Mocking Euclidean distance calculation for the hackathon
    # Real implementation would use Shapely and PyProj Azimuthal Equidistant
    
    def approx_dist(lat1, lon1, lat2, lon2):
        # Very rough approximation for meters (only valid for small distances)
        dlat = (lat2 - lat1) * 111320
        dlon = (lon2 - lon1) * 40000 * math.cos(math.radians((lat1+lat2)/2))
        return math.sqrt(dlat**2 + dlon**2)

    affected_villages = []
    total_pop = 0
    for v in villages:
        dist = approx_dist(hazard_lat, hazard_lon, v["lat"], v["lon"])
        if dist <= hazard_radius_m:
            tier = "PRIMARY" if dist <= hazard_radius_m * 0.3 else ("SECONDARY" if dist <= hazard_radius_m * 0.7 else "TERTIARY")
            affected_villages.append({
                "name": v["name"],
                "distance_m": round(dist, 1),
                "tier": tier,
                "population": v.get("population", 0)
            })
            total_pop += v.get("population", 0)
            
    affected_roads = []
    for r in roads:
        # Mock distance to road
        affected_roads.append({"name": r.get("name", "Unknown Road"), "status": "CAUTION" if hazard_radius_m > 1000 else "OPEN"})
        
    return {
        "affected_villages": affected_villages,
        "affected_roads": affected_roads,
        "total_population_at_risk": total_pop
    }
