def evaluate_evidence(evidence_sources):
    """
    Evidence and uncertainty assessment.
    evidence_sources: dict of source -> { 'freshness_hours': float, 'reliability': float }
    """
    effective_count = 0.0
    for source, data in evidence_sources.items():
        if data.get('freshness_hours', 100) < 24:
            effective_count += data.get('reliability', 1.0)
            
    if effective_count >= 3.0:
        return "HIGH"
    elif effective_count >= 1.5:
        return "MEDIUM"
    else:
        return "LOW"
