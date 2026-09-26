import os
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import StratifiedKFold, cross_val_score

def find_data_file():
    candidates = [
        'FLOWS/data/processed/sikkim_landslide_training_data_real.csv',
        'data/processed/sikkim_landslide_training_data_real.csv',
        'sikkim_landslide_training_data_real.csv',
        'FLOWS/data/processed/training_dataset.csv',
        'data/processed/training_dataset.csv'
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def run_pipeline():
    data_path = find_data_file()
    if not data_path:
        raise FileNotFoundError("Real Sikkim landslide training dataset not found!")

    print(f"Loading real landslide training data from: {data_path}")
    df = pd.read_csv(data_path)

    # Determine target column
    target_col = 'landslide_occurred' if 'landslide_occurred' in df.columns else 'label'
    y = df[target_col].astype(int)

    # Features: Environmental & Physical
    feature_candidates = [
        'elevation_m', 'slope_deg', 'aspect_deg', 'plan_curvature', 'profile_curvature',
        'topographic_wetness_index', 'soil_cohesion_kpa', 'internal_friction_angle_deg',
        'soil_unit_weight_kn_m3', 'hydraulic_conductivity_mm_h',
        'rainfall_1h_mm', 'rainfall_24h_mm', 'rainfall_72h_mm', 'rainfall_7d_mm', 'rainfall_30d_mm',
        'effective_saturation', 'pore_pressure_kpa', 'factor_of_safety'
    ]
    
    # Filter features that exist in df
    selected_features = [f for f in feature_candidates if f in df.columns]
    if len(selected_features) == 0:
        # Fallback to numeric columns
        selected_features = [c for c in df.select_dtypes(include=[np.number]).columns if c != target_col]

    X = df[selected_features].fillna(0)

    # Environmental only subset
    env_features = [f for f in selected_features if f not in ['factor_of_safety', 'pore_pressure_kpa', 'effective_saturation']]
    X_env = df[env_features].fillna(0)

    print(f"Dataset shape: {X.shape}, Positive events: {y.sum()} ({y.mean()*100:.1f}%)")

    # Train Model A (Environmental Only)
    print("Training Model A (Environmental Only XGBoost)...")
    model_A = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric='logloss',
        random_state=42
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    auc_A = cross_val_score(model_A, X_env, y, cv=cv, scoring='roc_auc').mean()
    model_A.fit(X_env, y)

    # Train Model B (Physics-Informed: Environmental + Soil Mechanics)
    print("Training Model B (Physics-Informed XGBoost)...")
    model_B = xgb.XGBClassifier(
        n_estimators=120,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric='logloss',
        random_state=42
    )
    auc_B = cross_val_score(model_B, X, y, cv=cv, scoring='roc_auc').mean()
    model_B.fit(X, y)

    print(f"Model A (Env Only) ROC-AUC: {auc_A:.4f}")
    print(f"Model B (Physics-Informed) ROC-AUC: {auc_B:.4f} (+{(auc_B - auc_A)*100:.2f}% boost)")

    # Save models
    out_dir = 'FLOWS/artifacts/models' if os.path.exists('FLOWS') else 'artifacts/models'
    os.makedirs(out_dir, exist_ok=True)
    model_A.save_model(os.path.join(out_dir, 'landslide_model_a.ubj'))
    model_B.save_model(os.path.join(out_dir, 'landslide_model_b.ubj'))

    metrics = {
        "dataset_rows": len(df),
        "positive_events": int(y.sum()),
        "features_used": selected_features,
        "model_A_auc": round(float(auc_A), 4),
        "model_B_auc": round(float(auc_B), 4),
        "physics_improvement_auc": round(float(auc_B - auc_A), 4),
        "status": "trained_successfully"
    }

    with open(os.path.join(out_dir, 'landslide_metrics.json'), 'w') as f:
        json.dump(metrics, f, indent=2)

    print("Landslide models & metrics saved successfully.")

if __name__ == "__main__":
    run_pipeline()
