import math
from .schemas import MechanicsResult

def classify_stability(fos: float) -> str:
    """Classify FoS into STABLE, MARGINAL, UNSTABLE."""
    if fos < 1.0: return "UNSTABLE"
    if fos <= 1.2: return "MARGINAL"
    return "STABLE"

def compute_mechanics(cohesion_kpa: float, friction_angle_deg: float, unit_weight_kn_m3: float, slip_depth_m: float, slope_deg: float, pore_pressure_kpa: float) -> MechanicsResult:
    """
    Infinite-slope effective stress FoS
    FoS = [c' + (γ*z*cos²β - u)*tan(φ')] / [γ*z*sinβ*cosβ]
    """
    if slip_depth_m <= 0:
        raise ValueError("slip_depth_m must be > 0")

    beta = math.radians(slope_deg)
    phi = math.radians(friction_angle_deg)
    
    normal_stress = unit_weight_kn_m3 * slip_depth_m * (math.cos(beta) ** 2)
    effective_normal = max(0.0, normal_stress - pore_pressure_kpa)
    
    shear_strength = cohesion_kpa + effective_normal * math.tan(phi)
    driving_shear = unit_weight_kn_m3 * slip_depth_m * math.sin(beta) * math.cos(beta)
    
    # Avoid division by zero on flat terrain
    if driving_shear > 0.001:
        fos = shear_strength / driving_shear
    else:
        fos = 9.99
    
    return MechanicsResult(
        factor_of_safety=fos,
        stability_state=classify_stability(fos),
        effective_normal_stress_kpa=effective_normal,
        driving_shear_stress_kpa=driving_shear,
        resisting_shear_strength_kpa=shear_strength
    )
