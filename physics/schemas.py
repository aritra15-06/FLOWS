from dataclasses import dataclass, field
from typing import Optional, List, Dict

PHYSICS_MODEL_VERSION = "infinite_slope_v2.0"

# Geotechnical limits
SLOPE_DEG_MIN, SLOPE_DEG_MAX = 0.0, 70.0
PHI_DEG_MIN, PHI_DEG_MAX = 10.0, 45.0
GAMMA_MIN, GAMMA_MAX = 12.0, 24.0
COHESION_MIN, COHESION_MAX = 0.0, 60.0
SLIP_DEPTH_MIN, SLIP_DEPTH_MAX = 0.3, 5.0
KS_MIN, KS_MAX = 0.1, 500.0

@dataclass
class SlopeState:
    location_id: str
    slope_deg: float
    cohesion_kpa: float
    friction_angle_deg: float
    unit_weight_kn_m3: float
    slip_depth_m: float
    hydraulic_conductivity_mm_h: float
    porosity_0_1: float
    initial_saturation_0_1: float
    groundwater_depth_m: Optional[float] = None

@dataclass
class CatchmentState:
    catchment_id: str
    area_km2: float
    curve_number: float
    channel_length_m: float
    channel_slope: float
    channel_roughness: float
    baseflow_m3s: float
    time_of_concentration_hr: float

@dataclass
class MechanicsResult:
    factor_of_safety: float
    stability_state: str
    effective_normal_stress_kpa: float
    driving_shear_stress_kpa: float
    resisting_shear_strength_kpa: float

@dataclass
class PhysicsOutput:
    factor_of_safety: float
    stability_state: str
    pore_pressure_kpa: float
    effective_saturation: float
    cumulative_infiltration_mm: float
    wetting_front_m: float
    infiltration_rate_mm_h: float
    mechanics_result: MechanicsResult

@dataclass
class FloodOutput:
    peak_discharge_m3s: float
    arrival_time_hr: float
    direct_runoff_mm: float
    routed_flow_series: List[float]
    travel_time_hr: float
