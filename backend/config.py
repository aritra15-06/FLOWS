import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
SEED_DIR = DATA_DIR / "seed"

CORS_ORIGINS = ["*"]

DEFAULT_MODEL_PATHS = {
    "landslide": MODELS_DIR / "xgb_model_latest.json",
    "flood": MODELS_DIR / "lgbm_model_latest.txt"
}
