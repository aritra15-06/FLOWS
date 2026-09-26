from typing import List
from .schemas import CatchmentState, FloodOutput
from .runoff import scs_cn_runoff, rational_peak_discharge, flood_arrival_time, manning_velocity
from .routing import estimate_travel_time

def run_flood_physics(state: CatchmentState, hourly_rainfall_mm: List[float]) -> FloodOutput:
    """
    Flash flood physics orchestrator.
    """
    total_rain = sum(hourly_rainfall_mm)
    direct_runoff = scs_cn_runoff(total_rain, state.curve_number)
    
    n_hours = max(1, len(hourly_rainfall_mm))
    intensity = total_rain / n_hours
    
    # Runoff coefficient C
    C = direct_runoff / max(total_rain, 0.001)
    if total_rain == 0:
        C = 0.0
    
    Q_peak = rational_peak_discharge(C, intensity, state.area_km2) + state.baseflow_m3s
    
    vel = manning_velocity(state.channel_roughness, 1.0, state.channel_slope)
    arrival_time = flood_arrival_time(state.channel_length_m, vel)
    travel_time = estimate_travel_time(state.channel_length_m, state.channel_slope, state.channel_roughness)
    
    return FloodOutput(
        peak_discharge_m3s=Q_peak,
        arrival_time_hr=arrival_time,
        direct_runoff_mm=direct_runoff,
        routed_flow_series=[Q_peak],  # Placeholder for full routing output
        travel_time_hr=travel_time
    )
