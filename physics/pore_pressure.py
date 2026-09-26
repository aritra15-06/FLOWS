from typing import Tuple

def pore_pressure_model(slip_depth_m: float, wetting_front_m: float, effective_saturation: float, groundwater_depth_m: float) -> Tuple[float, str]:
    """
    Calculate pore-water pressure at slip surface.
    Returns: pore_pressure_kpa, provenance tag
    """
    unit_weight_water = 9.81
    u = 0.0
    status = "ESTIMATED"
    
    if groundwater_depth_m is not None and groundwater_depth_m <= slip_depth_m:
        u = (slip_depth_m - groundwater_depth_m) * unit_weight_water
        status = "FROM_GROUNDWATER"
    elif wetting_front_m >= slip_depth_m:
        u = (wetting_front_m - slip_depth_m) * unit_weight_water * effective_saturation
        status = "FROM_WETTING_FRONT"
    else:
        u = 0.0 # unsaturated at slip plane
        status = "UNSATURATED"
        
    return u, status
