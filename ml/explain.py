import shap
import pandas as pd

def explain_prediction(model, feature_row):
    """SHAP explainability for top positive/negative drivers"""
    if isinstance(feature_row, pd.Series):
        feature_row = feature_row.to_frame().T

    try:
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(feature_row)
        
        # Determine format of shap_values
        if isinstance(shap_values, list):
            sv = shap_values[1][0]
        else:
            sv = shap_values[0]
            
        drivers = []
        for i, col in enumerate(feature_row.columns):
            drivers.append({"feature": col, "contribution": float(sv[i])})
            
        drivers = sorted(drivers, key=lambda x: abs(x["contribution"]), reverse=True)
        return drivers[:5]
    except Exception as e:
        return [{"feature": "error", "contribution": 0.0, "details": str(e)}]
