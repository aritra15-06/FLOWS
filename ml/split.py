from sklearn.model_selection import GroupKFold

def spatial_group_split(df, groups_col, n_splits=5):
    """Spatial GroupKFold splitting by catchment_id to prevent spatial leakage"""
    gkf = GroupKFold(n_splits=n_splits)
    groups = df[groups_col].values
    
    # Create dummy X and y
    X = df.drop(columns=[groups_col])
    y = df.get("label", [0]*len(df))
    
    splits = []
    for train_idx, test_idx in gkf.split(X, y, groups=groups):
        splits.append((train_idx, test_idx))
    return splits
