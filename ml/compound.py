def evaluate_compound_hazard(ls_prob, flood_prob, rainfall_24h, dist_stream, catchment_area):
    """Compound hazard coupling logic"""
    pathways = {
        "RAINFALL_SLOPE_BANK": False,
        "LANDSLIDE_CHANNEL_BLOCK": False,
        "BANK_UNDERCUTTING": False,
        "DEBRIS_DAM_BREACH": False,
        "UPSTREAM_FAILURE_DOWNSTREAM_FLOOD": False
    }
    
    # Heuristics based on physics interactions
    if rainfall_24h > 100 and dist_stream < 50:
        pathways["RAINFALL_SLOPE_BANK"] = True
        
    if ls_prob > 0.7 and dist_stream < 100:
        pathways["LANDSLIDE_CHANNEL_BLOCK"] = True
        
    if flood_prob > 0.8 and dist_stream < 30:
        pathways["BANK_UNDERCUTTING"] = True
        
    if pathways["LANDSLIDE_CHANNEL_BLOCK"] and rainfall_24h > 150:
        pathways["DEBRIS_DAM_BREACH"] = True
        
    if ls_prob > 0.8 and catchment_area > 10:
        pathways["UPSTREAM_FAILURE_DOWNSTREAM_FLOOD"] = True
        
    compound_score = max(ls_prob, flood_prob)
    if any(pathways.values()):
        compound_score = min(1.0, compound_score * 1.2)
        
    return {
        "compound_score": compound_score,
        "active_pathways": [k for k, v in pathways.items() if v]
    }
