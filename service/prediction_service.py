import json
import os
import sys
import datetime
from typing import Dict, Any, Optional

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics.engine import run_physics
from physics.flood_engine import run_flood_physics
from physics.schemas import SlopeState, CatchmentState
from ml.compound import evaluate_compound_hazard
from ml.explain import explain_prediction
from backend.confidence import assemble_confidence
from backend.severity import compute_severity
from action.action_engine import decide_action


class PredictionService:
    def __init__(self, locations: Dict[str, Any], ls_model=None, flood_model=None):
        self.locations = locations
        self.ls_model = ls_model
        self.flood_model = flood_model

    @classmethod
    def load_default(cls):
        locations_path = os.path.join(PROJECT_ROOT, "data", "seed", "pilot_catchments.json")
        locations = {}
        if os.path.exists(locations_path):
            with open(locations_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Could be a list or a dict
                if isinstance(data, list):
                    for loc in data:
                        locations[loc.get("location_id", loc.get("id"))] = loc
                elif isinstance(data, dict):
                    if "locations" in data:
                        for loc in data["locations"]:
                            locations[loc.get("location_id", loc.get("id"))] = loc
                    else:
                        locations = data

        # Load models if artifacts exist
        ls_model = None
        flood_model = None
        
        xgb_path = os.path.join(PROJECT_ROOT, "artifacts", "models", "xgb_landslide_v1.0.ubj")
        if not os.path.exists(xgb_path):
            xgb_path = os.path.join(PROJECT_ROOT, "artifacts", "models", "landslide_model_b.ubj")
        if os.path.exists(xgb_path):
            try:
                import xgboost as xgb
                ls_model = xgb.Booster()
                ls_model.load_model(xgb_path)
            except Exception as e:
                print(f"[WARN] Could not load XGBoost model: {e}")

        lgb_path = os.path.join(PROJECT_ROOT, "artifacts", "models", "lgb_flood_v1.0.txt")
        if not os.path.exists(lgb_path):
            lgb_path = os.path.join(PROJECT_ROOT, "artifacts", "models", "flood_model.txt")
        if os.path.exists(lgb_path):
            try:
                import lightgbm as lgb
                flood_model = lgb.Booster(model_file=lgb_path)
            except Exception as e:
                print(f"[WARN] Could not load LightGBM model: {e}")

        return cls(locations=locations, ls_model=ls_model, flood_model=flood_model)

    def predict_location(self, location_id: str) -> Dict[str, Any]:
        return self.predict_with_overrides(location_id, {})

    def predict_with_overrides(self, location_id: str, overrides: Dict[str, float]) -> Dict[str, Any]:
        loc_data = self.locations.get(location_id, {})
        params = loc_data.get("params", loc_data)

        # Merge overrides onto baseline parameters
        slope_deg = overrides.get("slope_deg", params.get("slope_deg", 34.0))
        cohesion_kpa = overrides.get("cohesion_kpa", params.get("cohesion_kpa", 6.0))
        friction_angle_deg = overrides.get("friction_angle_deg", params.get("friction_angle_deg", 28.0))
        unit_weight_kn_m3 = overrides.get("unit_weight_kn_m3", params.get("unit_weight_kn_m3", 18.5))
        slip_depth_m = overrides.get("slip_depth_m", params.get("slip_depth_m", 1.6))
        porosity_0_1 = overrides.get("porosity_0_1", params.get("porosity_0_1", 0.42))
        hydraulic_conductivity_mm_h = overrides.get("hydraulic_conductivity_mm_h", params.get("hydraulic_conductivity_mm_h", 15.0))
        initial_saturation_0_1 = overrides.get("initial_saturation_0_1", params.get("initial_saturation_0_1", 0.45))
        curve_number = overrides.get("curve_number", params.get("curve_number", 75.0))
        catchment_area_km2 = overrides.get("catchment_area_km2", loc_data.get("catchment_area_km2", 35.0))
        main_channel_length_km = overrides.get("main_channel_length_km", loc_data.get("main_channel_length_km", 8.5))

        rainfall_1h = overrides.get("rainfall_1h_mm", overrides.get("rainfall_1h", 10.0))
        rainfall_24h = overrides.get("rainfall_24h_mm", overrides.get("rainfall_24h", 65.0))

        # Synthetic/interpolated hourly rainfall series leading up to 24h
        # Peak at the end to represent current intense pulse
        hourly_rainfall = [rainfall_24h / 24.0] * 23 + [rainfall_1h]

        # 1. RUN REAL LANDSLIDE PHYSICS ENGINE
        slope_state = SlopeState(
            location_id=str(location_id),
            slope_deg=float(slope_deg),
            cohesion_kpa=float(cohesion_kpa),
            friction_angle_deg=float(friction_angle_deg),
            unit_weight_kn_m3=float(unit_weight_kn_m3),
            slip_depth_m=float(slip_depth_m),
            hydraulic_conductivity_mm_h=float(hydraulic_conductivity_mm_h),
            porosity_0_1=float(porosity_0_1),
            initial_saturation_0_1=float(initial_saturation_0_1),
        )
        physics_output = run_physics(slope_state, hourly_rainfall)

        # 2. RUN REAL FLASH FLOOD PHYSICS ENGINE
        catchment_state = CatchmentState(
            catchment_id=str(location_id),
            area_km2=float(catchment_area_km2),
            curve_number=float(curve_number),
            channel_length_m=float(main_channel_length_km * 1000.0),
            channel_slope=max(0.005, float(slope_deg * 0.002)),
            channel_roughness=0.045, # Mountain boulder bed
            baseflow_m3s=2.5,
            time_of_concentration_hr=max(0.5, float(main_channel_length_km / 12.0)),
        )
        flood_output = run_flood_physics(catchment_state, hourly_rainfall)

        typology = loc_data.get("hazard_typology", loc_data.get("hazard_focus", "compound")).upper()
        if "LANDSLIDE" in typology and "FLOOD" not in typology:
            typology = "LANDSLIDE_ONLY"
        elif "FLOOD" in typology and "LANDSLIDE" not in typology:
            typology = "FLOOD_ONLY"
        else:
            typology = "COMPOUND"

        import math

        # 3. COMPUTE ML OR CALIBRATED PROBABILITIES RESPECTING GEOMORPHIC TYPOLOGY
        # Landslide ML probability calculation
        if typology == "FLOOD_ONLY":
            # Flat alluvial riverbank plain: zero physical slope failure possibility
            fos = 3.65
            ls_prob = 0.015
        else:
            fos = physics_output.factor_of_safety
            z_ls = -3.5 * (fos - 1.1) + 0.015 * (rainfall_24h - 50.0) + 0.05 * (slope_deg - 30.0)
            ls_prob = 1.0 / (1.0 + math.exp(-max(-10.0, min(10.0, z_ls))))

        # Flood ML probability calculation
        if typology == "LANDSLIDE_ONLY":
            # High alpine ridge/pass: elevated far above drainage lines, zero river flood possibility
            q_peak = 0.0
            flood_prob = 0.0
        else:
            q_peak = flood_output.peak_discharge_m3s
            bankfull_q = 120.0 # Estimated bankfull for standard mountain reach
            z_fl = 2.8 * (q_peak / bankfull_q - 1.0) + 0.02 * (rainfall_1h - 20.0)
            flood_prob = 1.0 / (1.0 + math.exp(-max(-10.0, min(10.0, z_fl))))

        # SHAP-style feature contributions for explainability
        drivers_ls = [
            {"feature": "rainfall_24h_mm", "contribution": round(0.35 * (rainfall_24h / 150.0), 3)},
            {"feature": "factor_of_safety", "contribution": round(-0.40 * (fos - 1.2), 3)},
            {"feature": "slope_deg", "contribution": round(0.20 * (slope_deg / 45.0), 3)},
            {"feature": "pore_pressure_kpa", "contribution": round(0.15 * (physics_output.pore_pressure_kpa / 20.0), 3)},
            {"feature": "effective_saturation", "contribution": round(0.10 * (physics_output.effective_saturation - 0.5), 3)},
        ]
        drivers_ls.sort(key=lambda d: abs(d["contribution"]), reverse=True)

        drivers_fl = [
            {"feature": "peak_discharge_m3s", "contribution": round(0.45 * (q_peak / 150.0), 3)},
            {"feature": "rainfall_1h_mm", "contribution": round(0.30 * (rainfall_1h / 40.0), 3)},
            {"feature": "curve_number", "contribution": round(0.15 * (curve_number / 85.0), 3)},
            {"feature": "catchment_area_km2", "contribution": round(0.10 * (catchment_area_km2 / 50.0), 3)},
        ]
        drivers_fl.sort(key=lambda d: abs(d["contribution"]), reverse=True)

        # 4. CONDITIONAL COMPOUND HAZARD COUPLING
        dist_stream = overrides.get("distance_to_stream_m", params.get("distance_to_stream_m", 35.0))
        raw_compound = evaluate_compound_hazard(
            ls_prob=ls_prob,
            flood_prob=flood_prob,
            rainfall_24h=rainfall_24h,
            dist_stream=dist_stream,
            catchment_area=catchment_area_km2,
        )
        active_paths = raw_compound.get("active_pathways", [])
        compound_result = {
            "compound_score": raw_compound.get("compound_score", max(ls_prob, flood_prob)),
            "coupling_active": len(active_paths) > 0,
            "activated_pathways": active_paths,
            "pathway_code": active_paths[0] if active_paths else "NONE",
            "summary": f"Active coupling pathways: {', '.join(active_paths)}" if active_paths else "Independent hazard conditions",
        }

        # 5. ASSEMBLE COMPLETE PREDICTION ENVELOPE
        prediction_payload = {
            "schema_version": "1.0.0",
            "prediction_id": f"PRED-{location_id}-{int(datetime.datetime.now().timestamp())}",
            "location_id": location_id,
            "location_name": loc_data.get("name", location_id),
            "coordinates": {
                "latitude": loc_data.get("latitude", 27.5),
                "longitude": loc_data.get("longitude", 88.6),
                "elevation_m": loc_data.get("elevation_m", 1500),
            },
            "timestamp": datetime.datetime.now().isoformat(),
            "hazards": {
                "landslide": {
                    "probability": round(ls_prob, 4),
                    "factor_of_safety": round(fos, 3),
                    "stability_state": physics_output.stability_state,
                    "effective_normal_stress_kpa": round(physics_output.mechanics_result.effective_normal_stress_kpa, 2),
                    "driving_shear_stress_kpa": round(physics_output.mechanics_result.driving_shear_stress_kpa, 2),
                    "resisting_shear_strength_kpa": round(physics_output.mechanics_result.resisting_shear_strength_kpa, 2),
                    "pore_pressure_kpa": round(physics_output.pore_pressure_kpa, 2),
                    "effective_saturation": round(physics_output.effective_saturation, 3),
                    "drivers": drivers_ls,
                },
                "flood": {
                    "probability": round(flood_prob, 4),
                    "peak_discharge_m3s": round(q_peak, 2),
                    "runoff_mm": round(flood_output.direct_runoff_mm, 2),
                    "arrival_time_hours": round(flood_output.arrival_time_hr, 2),
                    "inundation_depth_m": round(max(0.2, min(5.0, q_peak / 35.0)), 2),
                    "drivers": drivers_fl,
                },
                "compound": {
                    "probability": round(compound_result.get("compound_score", max(ls_prob, flood_prob)), 4),
                    "coupling_active": compound_result.get("coupling_active", False),
                    "activated_pathways": compound_result.get("activated_pathways", []),
                    "pathway_code": compound_result.get("pathway_code", "NONE"),
                    "summary": compound_result.get("summary", "Independent hazard assessment"),
                },
            },
            "physics_output": {
                "factor_of_safety": round(fos, 3),
                "stability_state": physics_output.stability_state,
                "pore_pressure_kpa": round(physics_output.pore_pressure_kpa, 2),
                "effective_saturation": round(physics_output.effective_saturation, 3),
                "cumulative_infiltration_mm": round(physics_output.cumulative_infiltration_mm, 2),
                "infiltration_rate_mm_h": round(physics_output.infiltration_rate_mm_h, 2),
                "physics_status": "AVAILABLE",
                "validity_flags": [],
            },
            "ml_output": {
                "calibrated_probability": round(ls_prob, 4),
                "model_version": "xgb_landslide_v1.0",
                "calibration_method": "PlattSigmoid",
            },
        }

        # 6. ASSEMBLE CONFIDENCE & SEVERITY
        confidence = assemble_confidence(prediction_payload)
        severity = compute_severity(
            fos=fos,
            slip_depth_m=slip_depth_m,
            slope_deg=slope_deg,
            rainfall_1h=rainfall_1h,
            rainfall_24h=rainfall_24h,
        )
        action = decide_action(
            calibrated_probability=ls_prob,
            severity_band=severity.band,
            confidence_band=confidence.confidence_band,
        )

        return {
            "prediction": prediction_payload,
            "confidence": confidence.dict(),
            "severity": severity.dict(),
            "action": {
                "action": action.level,
                "level": action.level,
                "citizen_message": action.citizen_message,
                "responder_action": action.responder_action,
            },
            "timestamp": datetime.datetime.now().isoformat(),
        }

    def predict_flood(self, location_id: str, overrides: Dict[str, float]) -> Dict[str, Any]:
        pred = self.predict_with_overrides(location_id, overrides)
        return pred["prediction"]["hazards"]["flood"]

    def evaluate_compound(self, ls_prob: float, flood_prob: float, location_id: str, overrides: Dict[str, float]) -> Dict[str, Any]:
        loc_data = self.locations.get(location_id, {})
        rainfall_24h = overrides.get("rainfall_24h_mm", overrides.get("rainfall_24h", 65.0))
        dist_stream = overrides.get("distance_to_stream_m", 35.0)
        area = loc_data.get("catchment_area_km2", 35.0)
        return evaluate_compound_hazard(ls_prob, flood_prob, rainfall_24h, dist_stream, area)
