import math
from typing import Tuple

def scs_cn_runoff(rainfall_mm: float, curve_number: float) -> float:
    """
    SCS-CN rainfall-runoff model.
    """
    if curve_number <= 0: return 0.0
    S = (25400.0 / curve_number) - 254.0
    Ia = 0.2 * S
    if rainfall_mm <= Ia: return 0.0
    return ((rainfall_mm - Ia) ** 2) / (rainfall_mm - Ia + S)

def rational_peak_discharge(C: float, intensity_mm_h: float, area_km2: float) -> float:
    """
    Rational peak discharge (Q_peak m3/s).
    """
    return (C * intensity_mm_h * area_km2) / 3.6

def manning_velocity(n: float, R: float, S: float) -> float:
    """
    Manning velocity m/s.
    """
    return (1.0 / n) * (R ** (2.0/3.0)) * math.sqrt(max(0.0001, S))

def flood_arrival_time(distance_m: float, velocity_m_s: float) -> float:
    """
    Flood arrival time in hours.
    """
    if velocity_m_s <= 0: return 999.0
    return (distance_m / velocity_m_s) / 3600.0
