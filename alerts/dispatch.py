def dispatch_alerts(alert_payload, contacts, dry_run=True):
    results = []
    for c in contacts:
        # Dispatch logic goes here
        results.append({"contact": c["name"], "status": "sent" if not dry_run else "simulated"})
    return results
