import math
from typing import Tuple, List
from .schemas import SlopeState

SOIL_SUCTION_HEAD_MM = {
    'sand': 49.5,
    'loam': 88.9,
    'clay': 316.3,
    'default': 100.0
}

def infiltration_model(state: SlopeState, hourly_rainfall_mm: List[float], soil_texture: str = 'default') -> Tuple[float, float, float, float]:
    """
    Green-Ampt infiltration model.
    Returns: cumulative_infiltration_mm, infiltration_rate_mm_h, wetting_front_m, effective_saturation
    """
    suction_head = SOIL_SUCTION_HEAD_MM.get(soil_texture, SOIL_SUCTION_HEAD_MM['default'])
    cumulative_inf = 0.0
    Ks = state.hydraulic_conductivity_mm_h
    delta_theta = state.porosity_0_1 - state.initial_saturation_0_1 * state.porosity_0_1
    
    f = 0.0
    for p in hourly_rainfall_mm:
        if p <= Ks:
            f = p
        else:
            if cumulative_inf == 0:
                f = p
            else:
                f = Ks * (1 + (suction_head * delta_theta) / cumulative_inf)
                if f > p:
                    f = p
        cumulative_inf += f
        
    inf_rate = f if hourly_rainfall_mm else 0.0
    wetting_front = (cumulative_inf / 1000.0) / max(delta_theta, 0.01) if delta_theta > 0 else 0.0
    eff_sat = min(1.0, state.initial_saturation_0_1 + (cumulative_inf / 1000.0) / (state.slip_depth_m * state.porosity_0_1)) if state.slip_depth_m > 0 else 1.0
    
    return cumulative_inf, inf_rate, wetting_front, eff_sat
