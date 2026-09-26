import pandas as pd
import numpy as np
import os
from .feature_manifest import FEATURE_NAMES, FLOOD_FEATURES

def load_landslide_inventory(path):
    if not os.path.exists(path):
        return pd.DataFrame(columns=["id", "latitude", "longitude", "date", "label"])
    return pd.read_csv(path)

def load_terrain_features(path):
    if not os.path.exists(path):
        return pd.DataFrame()
    return pd.read_csv(path)

def load_soil_features(path):
    if not os.path.exists(path):
        return pd.DataFrame()
    return pd.read_csv(path)

def load_rainfall_timeseries(path):
    if not os.path.exists(path):
        return pd.DataFrame()
    return pd.read_csv(path)

def merge_training_dataset(inventory_df, terrain_df, soil_df, rainfall_df):
    # Dummy merge logic for now
    return inventory_df

def generate_negative_samples(terrain_df, inventory_df, ratio=3):
    # Dummy logic
    return terrain_df.sample(n=len(inventory_df)*ratio, replace=True)

def generate_demo_dataset(path, num_rows=500):
    np.random.seed(42)
    data = {
        "id": np.arange(num_rows),
        "latitude": np.random.uniform(27.0, 28.0, num_rows),
        "longitude": np.random.uniform(88.0, 89.0, num_rows),
        "date": pd.date_range("2023-01-01", periods=num_rows).astype(str),
        "label": np.random.choice([0, 1], num_rows, p=[0.7, 0.3]),
        "catchment_id": np.random.randint(1, 10, num_rows)
    }
    for feature in FEATURE_NAMES:
        if feature == "elevation":
            data[feature] = np.random.uniform(200, 4500, num_rows)
        elif feature == "slope":
            data[feature] = np.random.uniform(5, 55, num_rows)
        elif feature.startswith("rainfall"):
            data[feature] = np.random.uniform(0, 300, num_rows)
        elif feature == "clay_percent":
            data[feature] = np.random.uniform(10, 60, num_rows)
        elif feature == "land_cover_class":
            data[feature] = np.random.choice(["forest", "urban", "agri"], num_rows)
        else:
            data[feature] = np.random.uniform(0, 100, num_rows)
            
    df = pd.DataFrame(data)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)
    return df
