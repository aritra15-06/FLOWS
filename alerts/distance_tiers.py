def get_distance_tier(distance_m: float, hazard_radius_m: float) -> str:
    if distance_m <= hazard_radius_m * 0.3:
        return "PRIMARY"
    elif distance_m <= hazard_radius_m * 0.7:
        return "SECONDARY"
    elif distance_m <= hazard_radius_m:
        return "TERTIARY"
    return "SAFE"
