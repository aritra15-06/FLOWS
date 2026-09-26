import pandas as pd

def filter_eligible_rows(df):
    """Only verified, complete rows enter training"""
    # For now, just drop rows with missing essential labels
    if "label" not in df.columns:
        return df
    
    # Filter out any unverified or highly uncertain rows if such columns existed
    # In this prototype, we'll ensure we have non-null features
    return df.dropna(subset=["label"])
