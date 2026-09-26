def send_sms(phone: str, message: str, dry_run: bool = True):
    if dry_run:
        print(f"[DRY-RUN] Sending SMS to {phone}: {message}")
        return True
    
    # Real SMS integration (e.g., Twilio) would go here
    return True
