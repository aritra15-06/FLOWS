import math
from typing import List, Dict

def muskingum_route(inflow_series: List[float], K: float, X: float, dt: float) -> List[float]:
    """
    Muskingum-Cunge channel routing.
    """
    if not inflow_series: return []
    
    denom = (2*K*(1-X) + dt)
    if denom == 0:
        return inflow_series # fallback
        
    C1 = (dt - 2*K*X) / denom
    C2 = (dt + 2*K*X) / denom
    C3 = (2*K*(1-X) - dt) / denom
    
    outflow = [inflow_series[0]]
    for i in range(1, len(inflow_series)):
        I2 = inflow_series[i]
        I1 = inflow_series[i-1]
        O1 = outflow[-1]
        O2 = C1*I2 + C2*I1 + C3*O1
        outflow.append(max(0.0, O2))
        
    return outflow

def estimate_travel_time(channel_length_m: float, slope: float, roughness: float) -> float:
    """
    Estimate travel time (hours) along a channel.
    """
    # Simple assumption of hydraulic radius R=1m
    velocity = (1.0 / roughness) * math.sqrt(max(0.0001, slope))
    if velocity <= 0: return 999.0
    return (channel_length_m / velocity) / 3600.0

def route_flood_downstream(Q_peak: float, channel_params: Dict[str, float], distances: List[float]) -> Dict[str, List[float]]:
    """
    Route flood downstream giving arrival times + attenuated peaks at each downstream point.
    """
    times = []
    peaks = []
    slope = channel_params.get('slope', 0.001)
    roughness = channel_params.get('roughness', 0.035)
    
    v = (1.0 / roughness) * math.sqrt(max(0.0001, slope))
    attenuation = 0.95
    for dist in distances:
        t = (dist / v) / 3600.0
        times.append(t)
        peaks.append(Q_peak * attenuation)
        attenuation *= 0.95
    return {"arrival_times": times, "attenuated_peaks": peaks}
