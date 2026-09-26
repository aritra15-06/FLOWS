from typing import List
from .schemas import (
    SlopeState, PhysicsOutput, 
    SLOPE_DEG_MIN, SLOPE_DEG_MAX, 
    PHI_DEG_MIN, PHI_DEG_MAX, 
    SLIP_DEPTH_MIN, SLIP_DEPTH_MAX
)
from .infiltration import infiltration_model
from .pore_pressure import pore_pressure_model
from .factor_of_safety import compute_mechanics

def validate_state(state: SlopeState):
    """Validate physical parameters."""
    if not (SLOPE_DEG_MIN <= state.slope_deg <= SLOPE_DEG_MAX): 
        raise ValueError(f"Invalid slope_deg: {state.slope_deg}")
    if not (PHI_DEG_MIN <= state.friction_angle_deg <= PHI_DEG_MAX): 
        raise ValueError(f"Invalid friction_angle_deg: {state.friction_angle_deg}")
    if not (SLIP_DEPTH_MIN <= state.slip_depth_m <= SLIP_DEPTH_MAX): 
        raise ValueError(f"Invalid slip_depth_m: {state.slip_depth_m}")

def run_physics(state: SlopeState, hourly_rainfall_mm: List[float], soil_texture: str = 'default') -> PhysicsOutput:
    """
    Landslide physics orchestrator.
    """
    validate_state(state)
    
    cum_inf, inf_rate, wet_front, eff_sat = infiltration_model(state, hourly_rainfall_mm, soil_texture)
    
    gw = state.groundwater_depth_m if state.groundwater_depth_m is not None else 999.0
    u, _ = pore_pressure_model(state.slip_depth_m, wet_front, eff_sat, gw)
    
    mech = compute_mechanics(
        state.cohesion_kpa, 
        state.friction_angle_deg, 
        state.unit_weight_kn_m3, 
        state.slip_depth_m, 
        state.slope_deg, 
        u
    )
    
    return PhysicsOutput(
        factor_of_safety=mech.factor_of_safety,
        stability_state=mech.stability_state,
        pore_pressure_kpa=u,
        effective_saturation=eff_sat,
        cumulative_infiltration_mm=cum_inf,
        wetting_front_m=wet_front,
        infiltration_rate_mm_h=inf_rate,
        mechanics_result=mech
    )
