#!/usr/bin/env python3
"""
FLOWS — Flash Flood & Landslide Observation & Warning System
Start the backend server + serve the frontend SPA + open browser.
"""
import uvicorn
import sys
import os
import threading
import time
import webbrowser

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def open_browser():
    """Wait for server to start, then open the browser automatically."""
    time.sleep(1.8)
    url = "http://localhost:8000"
    print(f"  [AUTO-LAUNCH] Opening browser at {url} ...")
    webbrowser.open(url)

if __name__ == "__main__":
    print("=" * 65)
    print("  FLOWS — Flash Flood & Landslide Observation & Warning System")
    print("  Team Heisenbug — SIH Round 2")
    print("=" * 65)
    print()
    print("  Starting server at http://localhost:8000")
    print("  Web dashboard will open automatically in your browser.")
    print("  Press Ctrl+C to stop.")
    print("=" * 65)
    print()

    # Start browser auto-opener in a background thread
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
