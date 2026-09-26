import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from backend.main import app

with TestClient(app) as client:
    # 1. Health
    r = client.get('/api/health')
    print('[PASS] GET /api/health:', r.status_code, r.json())

    # 2. Locations
    r = client.get('/api/locations')
    locs = r.json()
    print(f'[PASS] GET /api/locations: {r.status_code}, {len(locs)} locations returned')

    # 3. Predict
    r = client.post('/api/predict', json={'location_id': 'LOC01'})
    data = r.json()
    fos = data.get('prediction', {}).get('physics_output', {}).get('factor_of_safety')
    print(f'[PASS] POST /api/predict: {r.status_code}, FoS={fos}')

    # 4. Simulate
    r = client.post('/api/simulate', json={'location_id': 'LOC01', 'overrides': {'rainfall_24h_mm': 180.0, 'slope_deg': 42.0}})
    sim_data = r.json()
    sim_fos = sim_data.get('prediction', {}).get('physics_output', {}).get('factor_of_safety')
    sim_action = sim_data.get('action', {}).get('action')
    print(f'[PASS] POST /api/simulate: {r.status_code}, FoS={sim_fos}, Action={sim_action}')

    # 5. Impact
    r = client.get('/api/impact/LOC01')
    impact = r.json()
    n_villages = len(impact.get('affected_villages', []))
    n_roads = len(impact.get('affected_roads', []))
    print(f'[PASS] GET /api/impact/LOC01: {r.status_code}, {n_villages} villages, {n_roads} roads')

    # 6. Sources
    r = client.get('/api/sources')
    print(f'[PASS] GET /api/sources: {r.status_code}')

    # 7. Frontend root
    r = client.get('/')
    print(f'[PASS] GET / (frontend root): {r.status_code}, HTML length={len(r.text)}')
