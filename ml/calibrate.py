from sklearn.calibration import CalibratedClassifierCV
import json
import os

def calibrate_model(model, X_val, y_val, method='sigmoid'):
    """Probability calibration"""
    calibrator = CalibratedClassifierCV(model, method=method, cv="prefit")
    calibrator.fit(X_val, y_val)
    return calibrator

def save_calibration(calibrator, path='artifacts/models/calibrator.json'):
    # In a real setup, we'd save the calibrator object using pickle or joblib
    # Here we just save a mock JSON
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump({"calibrated": True}, f)
