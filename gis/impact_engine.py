import math
from typing import List, Dict, Any

def haversine_dist(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * (math.sin(dlambda / 2.0) ** 2)
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))

def point_to_segment_dist(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Distance from point to a line segment in meters (local projection)."""
    # Project degrees to meters relative to (x1, y1)
    cos_lat = math.cos(math.radians((y1 + y2) / 2.0))
    mx = (px - x1) * 111320.0 * cos_lat
    my = (py - y1) * 111320.0
    seg_dx = (x2 - x1) * 111320.0 * cos_lat
    seg_dy = (y2 - y1) * 111320.0
    seg_len_sq = seg_dx * seg_dx + seg_dy * seg_dy
    if seg_len_sq <= 0.001:
        return math.hypot(mx, my)
    t = max(0.0, min(1.0, (mx * seg_dx + my * seg_dy) / seg_len_sq))
    proj_x = t * seg_dx
    proj_y = t * seg_dy
    return math.hypot(mx - proj_x, my - proj_y)

def compute_impact(
    hazard_lat: float,
    hazard_lon: float,
    hazard_radius_m: float = 6000.0,
    villages: List[Dict] = None,
    roads: List[Dict] = None,
    bridges: List[Dict] = None
) -> Dict[str, Any]:
    villages = villages or []
    roads = roads or []
    bridges = bridges or []

    # Calculate distance to all villages
    village_dists = []
    for v in villages:
        v_lat = float(v.get("lat", 0.0))
        v_lon = float(v.get("lon", 0.0))
        d_m = haversine_dist(hazard_lat, hazard_lon, v_lat, v_lon)
        village_dists.append({
            "name": v.get("name", "Unknown Village"),
            "distance_m": round(d_m, 1),
            "population": int(v.get("population", 0)),
            "lat": v_lat,
            "lon": v_lon
        })

    village_dists.sort(key=lambda x: x["distance_m"])

    # Effective impact threshold: at least radius, or include nearest 2 settlements if remote
    max_radius = max(hazard_radius_m, 6500.0)
    affected_villages = []
    total_pop = 0

    for v in village_dists:
        if v["distance_m"] <= max_radius or len(affected_villages) < 1:
            d = v["distance_m"]
            tier = "EVACUATE_NOW" if d <= 2000.0 else ("PREPARE" if d <= 4500.0 else "WATCH")
            item = {
                "name": v["name"],
                "distance_m": v["distance_m"],
                "tier": tier,
                "population": v["population"]
            }
            affected_villages.append(item)
            total_pop += v["population"]
            if len(affected_villages) >= 4:
                break

    # Calculate distance to roads
    affected_roads = []
    for r in roads:
        coords = r.get("coordinates", [])
        min_road_d = 999999.0
        for i in range(len(coords) - 1):
            p1 = coords[i]
            p2 = coords[i + 1]
            d = point_to_segment_dist(hazard_lon, hazard_lat, p1[1], p1[0], p2[1], p2[0])
            if d < min_road_d:
                min_road_d = d

        if min_road_d < 999990.0:
            status = "BLOCKED" if min_road_d <= 800.0 else ("RESTRICTED" if min_road_d <= 2500.0 else "CAUTION")
            affected_roads.append({
                "name": r.get("name", "Strategic Transport Corridor"),
                "status": status,
                "distance_m": round(min_road_d, 1)
            })

    affected_roads.sort(key=lambda x: x["distance_m"])

    # Calculate distance to bridges
    affected_bridges = []
    for b in bridges:
        b_lat = float(b.get("lat", 0.0))
        b_lon = float(b.get("lon", 0.0))
        d_m = haversine_dist(hazard_lat, hazard_lon, b_lat, b_lon)
        if d_m <= 8500.0:
            status = "IMMINENT_COLLAPSE" if d_m <= 1200.0 else ("SUBMERGENCE_RISK" if d_m <= 3500.0 else "SCOUR_WARNING")
            affected_bridges.append({
                "name": b.get("name", "River Crossing"),
                "status": status,
                "distance_m": round(d_m, 1)
            })

    affected_bridges.sort(key=lambda x: x["distance_m"])

    return {
        "affected_villages": affected_villages,
        "affected_roads": affected_roads,
        "affected_bridges": affected_bridges,
        "total_population_at_risk": total_pop,
        "nearest_settlement": affected_villages[0] if affected_villages else None
    }
