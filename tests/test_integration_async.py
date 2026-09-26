import asyncio
import sys
sys.path.insert(0, '.')
from httpx import AsyncClient, ASGITransport
from backend.main import app

async def main():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health
        r = await client.get('/api/health')
        assert r.status_code == 200, f"Health check failed: {r.status_code}"
        print('[PASS] GET /api/health:', r.status_code, r.json())

        # 2. Locations
        r = await client.get('/api/locations')
        assert r.status_code == 200
        locs = r.json()
        assert len(locs) >= 8, f"Expected at least 8 locations, got {len(locs)}"
        print(f'[PASS] GET /api/locations: {r.status_code}, {len(locs)} locations returned')

        # 3. Predict
        r = await client.post('/api/predict', json={'location_id': 'LOC01'})
        assert r.status_code == 200
        data = r.json()
        fos = data.get('prediction', {}).get('physics_output', {}).get('factor_of_safety')
        assert fos is not None
        print(f'[PASS] POST /api/predict: {r.status_code}, FoS={fos}')

        # 4. Simulate
        r = await client.post('/api/simulate', json={'location_id': 'LOC01', 'overrides': {'rainfall_24h_mm': 180.0, 'slope_deg': 42.0}})
        assert r.status_code == 200
        sim_data = r.json()
        sim_fos = sim_data.get('prediction', {}).get('physics_output', {}).get('factor_of_safety')
        sim_action = sim_data.get('action', {}).get('action')
        print(f'[PASS] POST /api/simulate: {r.status_code}, FoS={sim_fos}, Action={sim_action}')

        # 5. Impact
        r = await client.get('/api/impact/LOC01')
        assert r.status_code == 200
        impact = r.json()
        n_villages = len(impact.get('affected_villages', []))
        n_roads = len(impact.get('affected_roads', []))
        print(f'[PASS] GET /api/impact/LOC01: {r.status_code}, {n_villages} villages, {n_roads} roads')

        # 6. Sources
        r = await client.get('/api/sources')
        assert r.status_code == 200
        sources = r.json()
        assert len(sources) == 10
        print(f'[PASS] GET /api/sources: {r.status_code}, {len(sources)} data sources active')

        # 7. Flood prediction
        r = await client.post('/api/flood/predict', json={'location_id': 'LOC01', 'rainfall_24h_mm': 95.0})
        assert r.status_code == 200
        fl_res = r.json()
        print(f'[PASS] POST /api/flood/predict: {r.status_code}, peak_discharge={fl_res.get("peak_discharge_m3s")} m3/s')

        # 8. Compound hazard
        r = await client.post('/api/compound', json={'location_id': 'LOC01', 'rainfall_24h_mm': 120.0})
        assert r.status_code == 200
        cp_res = r.json()
        print(f'[PASS] POST /api/compound: {r.status_code}, coupling_active={cp_res.get("coupling_active")}')

        # 9. Evidence
        r = await client.get('/api/evidence/LOC01')
        assert r.status_code == 200
        ev_res = r.json()
        print(f'[PASS] GET /api/evidence/LOC01: {r.status_code}, FoS={ev_res.get("physics", {}).get("factor_of_safety")}')

        # 10. Alerts send (dry-run & live)
        r = await client.post('/api/alerts/send', json={'location_id': 'LOC01', 'action': 'WARNING', 'message': 'Test alert', 'dry_run': True, 'language': 'English'})
        assert r.status_code == 200
        alert_res = r.json()
        print(f'[PASS] POST /api/alerts/send: {r.status_code}, mode={alert_res.get("mode")}, sent={alert_res.get("messages_sent")}')

        # 11. Scorecard
        r = await client.get('/api/scorecard/EVT-2023-10-04')
        assert r.status_code == 200
        sc_res = r.json()
        print(f'[PASS] GET /api/scorecard: {r.status_code}, event={sc_res.get("event", {}).get("title")}')

        # 12. Training lifecycle
        r = await client.post('/api/train/start')
        assert r.status_code == 200
        job_id = r.json().get('job_id')
        r = await client.get(f'/api/train/status/{job_id}')
        assert r.status_code == 200
        print(f'[PASS] POST/GET /api/train: {r.status_code}, job={job_id}, status={r.json().get("status")}')

        # 13. Frontend root
        r = await client.get('/')
        assert r.status_code == 200
        print(f'[PASS] GET / (frontend root): {r.status_code}, HTML length={len(r.text)}')

    print("\n>>> ALL 13 ENDPOINT INTEGRATION TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    asyncio.run(main())
