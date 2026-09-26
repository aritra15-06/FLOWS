import os
import json
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import StratifiedKFold, cross_val_score

def find_flood_data_file():
    candidates = [
        'FLOWS/data/processed/sikkim_flash_flood_training_data_real.csv',
        'data/processed/sikkim_flash_flood_training_data_real.csv',
        'sikkim_flash_flood_training_data_real.csv',
        'FLOWS/data/processed/training_dataset_flood.csv',
        'data/processed/training_dataset_flood.csv'
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def run_pipeline():
    data_path = find_flood_data_file()
    if not data_path:
        raise FileNotFoundError("Real Sikkim flash flood training dataset not found!")

    print(f"Loading real flash flood training data from: {data_path}")
    df = pd.read_csv(data_path)

    target_col = 'flood_occurred' if 'flood_occurred' in df.columns else 'label'
    y = df[target_col].astype(int)

    feature_candidates = [
        'catchment_area_km2', 'curve_number', 'topographic_wetness_index', 'stream_power_index',
        'rainfall_1h_mm', 'rainfall_24h_mm', 'rainfall_72h_mm',
        'effective_saturation', 'peak_discharge_m3s', 'inundation_depth_m'
    ]

    selected_features = [f for f in feature_candidates if f in df.columns]
    if len(selected_features) == 0:
        selected_features = [c for c in df.select_dtypes(include=[np.number]).columns if c != target_col]

    X = df[selected_features].fillna(0)

    print(f"Flood dataset shape: {X.shape}, Positive flood surges: {y.sum()} ({y.mean()*100:.2f}%)")

    print("Training LightGBM Flash Flood Classifier...")
    model = lgb.LGBMClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.06,
        subsample=0.85,
        random_state=42,
        verbose=-1
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    auc_score = cross_val_score(model, X, y, cv=cv, scoring='roc_auc').mean()
    model.fit(X, y)

    print(f"LightGBM Flash Flood Model ROC-AUC: {auc_score:.4f}")

    out_dir = 'FLOWS/artifacts/models' if os.path.exists('FLOWS') else 'artifacts/models'
    os.makedirs(out_dir, exist_ok=True)
    model.booster_.save_model(os.path.join(out_dir, 'flood_model.txt'))

    metrics = {
        "dataset_rows": len(df),
        "positive_flood_events": int(y.sum()),
        "features_used": selected_features,
        "flood_model_auc": round(float(auc_score), 4),
        "status": "trained_successfully"
    }

    with open(os.path.join(out_dir, 'flood_metrics.json'), 'w') as f:
        json.dump(metrics, f, indent=2)

    print("Flash flood model & metrics saved successfully.")

if __name__ == "__main__":
    run_pipeline()
