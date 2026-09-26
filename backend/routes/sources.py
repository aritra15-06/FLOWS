from fastapi import APIRouter

router = APIRouter()

@router.get("/sources")
def get_sources():
    return [
        {"id": "imd", "name": "IMD Rainfall", "type": "Precipitation", "status": "LIVE", "latency": "142 ms", "last_update": "5 mins ago", "region": "India", "coverage": "0.25° Daily/Hourly Grid"},
        {"id": "chirps", "name": "CHIRPS v2.0", "type": "Precipitation", "status": "LIVE", "latency": "210 ms", "last_update": "1 hour ago", "region": "Global", "coverage": "0.05° Satellite Precipitation"},
        {"id": "gpm", "name": "GPM IMERG", "type": "Precipitation", "status": "LIVE", "latency": "180 ms", "last_update": "25 mins ago", "region": "Global", "coverage": "0.1° Early Run 30-min"},
        {"id": "cwc", "name": "CWC Gauge", "type": "Streamflow", "status": "DELAYED", "latency": "350 ms", "last_update": "2 hours ago", "region": "India", "coverage": "Teesta Basin Telemetric Gauges"},
        {"id": "soilgrids", "name": "SoilGrids 250m", "type": "Soil", "status": "LIVE", "latency": "165 ms", "last_update": "12 hours ago", "region": "Global", "coverage": "ISRIC Physical Soil Properties"},
        {"id": "copdem", "name": "Copernicus DEM", "type": "Terrain", "status": "LIVE", "latency": "95 ms", "last_update": "Static 2024", "region": "Global", "coverage": "GLO-30 30m DSM"},
        {"id": "osm", "name": "OpenStreetMap", "type": "Infrastructure", "status": "LIVE", "latency": "120 ms", "last_update": "4 hours ago", "region": "Global", "coverage": "NH-10 Transport & Settlements"},
        {"id": "gsi", "name": "GSI Bhukosh", "type": "Landslide", "status": "CACHED", "latency": "290 ms", "last_update": "1 day ago", "region": "India", "coverage": "National Landslide Inventory"},
        {"id": "s1", "name": "Sentinel-1 SAR", "type": "Satellite", "status": "LIVE", "latency": "240 ms", "last_update": "6 hours ago", "region": "Global", "coverage": "C-band Soil Moisture & Deformation"},
        {"id": "vedas", "name": "VEDAS/MOSDAC", "type": "Satellite", "status": "LIVE", "latency": "195 ms", "last_update": "3 hours ago", "region": "India", "coverage": "ISRO Himalayan Disaster Hub"},
    ]
