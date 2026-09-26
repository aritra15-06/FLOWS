import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# Add root directory to sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from service.prediction_service import PredictionService

# Import routes
from backend.routes import (
    locations, predict, simulate, flood, compound,
    impact, alerts, train, evidence, sources, scorecard,
    waterways, terrain
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print("  Initializing FLOWS Backend Services...")
    print("=" * 60)
    
    # Load singleton PredictionService
    app.state.prediction_service = PredictionService.load_default()
    print(f"  [OK] PredictionService loaded with {len(app.state.prediction_service.locations)} pilot locations")
    print("  [OK] Physics & Hydrology Engines active")
    print("  [OK] Compound Hazard Coupling initialized")
    print("=" * 60)
    
    yield
    print("FLOWS Backend shutting down...")

app = FastAPI(title="FLOWS Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routes
app.include_router(locations.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")
app.include_router(flood.router, prefix="/api")
app.include_router(compound.router, prefix="/api")
app.include_router(impact.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(train.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(scorecard.router, prefix="/api")
app.include_router(waterways.router, prefix="/api")
app.include_router(terrain.router, prefix="/api")

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "FLOWS",
        "version": "1.0.0",
        "operating_mode": "NOMINAL",
    }

# Mount static files for 3D terrain heightmaps if available
heightmap_dir = os.path.join(PROJECT_ROOT, "terrain3d", "heightmaps")
if os.path.exists(heightmap_dir):
    app.mount("/terrain3d/heightmaps", StaticFiles(directory=heightmap_dir), name="heightmaps")

# Mount built React frontend distribution
dist_dir = os.path.join(PROJECT_ROOT, "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")
    print(f"Mounted frontend from {dist_dir}")
else:
    print(f"Notice: frontend/dist not found at {dist_dir}. Build with 'npm run build' inside frontend/")
