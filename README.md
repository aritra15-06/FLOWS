# FLOWS — Flash Flood & Landslide Observation & Warning System

**Physics-Informed Geotechnical & Hydrological Multi-Hazard Intelligence Platform**  
*Autonomous Himalayan Corridor Monitoring | Teesta River Basin, Sikkim (NH-10, SH-1, SH-2)*

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.0-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/React-18.x-61DAFB.svg)](https://react.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen.svg)](https://leafletjs.com/)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.0+-green.svg)](https://xgboost.readthedocs.io/)
[![LightGBM](https://img.shields.io/badge/LightGBM-4.0+-orange.svg)](https://lightgbm.readthedocs.io/)
[![OpenStreetMap](https://img.shields.io/badge/OSM-Teesta%20Drainage-blue.svg)](https://www.openstreetmap.org/)

---

## 1. Executive Summary & Problem Context

The North Sikkim Himalayas and the Teesta River Basin constitute one of the most tectonically active, geomorphically steep, and hydrometeorologically extreme mountainous terrains on Earth. Arterial lifelines—most prominently the **National Highway 10 (NH-10)**, the **Mangan–Chungthang State Highway (SH-1)**, and the **Chungthang–Lachen / Chungthang–Lachung Corridors (SH-2)**—suffer recurrent, catastrophic disruptions from compound geological and hydrological hazards:

1. **Mass Wasting (Landslides)**: Intense monsoonal rainfall saturates fractured schist and gneiss rock masses, causing deep-seated rotational collapses, planar bedding slides, and high-velocity debris flows.
2. **Flash Floods & Hydrological Surges**: Cloudbursts and glacier/moraine melt produce severe hydraulic discharge spikes, overbank inundations, and toe scour erosion that destabilizes valley-bottom slope embankments.
3. **Compound Multi-Hazard Cascades**: Landslides blocking river channels form ephemeral debris dams that subsequently breach, or high-discharge floodwaters undercut toe slopes, triggering immediate slope collapse.

**FLOWS** addresses this crisis through a **Physics-Informed, Machine-Learning-Calibrated Multi-Hazard Early-Warning Platform**:
- **Deterministic Geotechnical Physics**: Infinite Slope Stability Model and Mohr-Coulomb failure criterion solving effective stress, pore-water pressure, and instantaneous geotechnical Factor of Safety ($FoS$).
- **Deterministic Hydrological Physics**: SCS Curve Number runoff modeling combined with Muskingum channel routing and Manning-Strickler hydraulics to calculate peak discharge ($Q$) and inundation depth.
- **Physics-Augmented Machine Learning**: Calibrated **XGBoost** (landslide) and **LightGBM** (flood) classifiers trained on physics-solved feature vectors and calibrated with Platt scaling.
- **Interactive Multi-Hazard Web Console**: Single-command turnkey application featuring an interactive 153-day monsoon crisis simulation, authentic OpenStreetMap river drainage conveyance, multi-region storm fronts, dynamic in-panel emergency directives, and custom clicked point hazard inference.

---

## 2. Core Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │  10 Multi-Source Environmental Feeds        │
                    │  IMD, GPM, CHIRPS, CWC, Copernicus DEM,     │
                    │  SoilGrids, OpenStreetMap, Sentinel-1 SAR    │
                    └──────────────────────┬───────────────────────┘
                                           │
                    ┌──────────────────────▼───────────────────────┐
                    │  Deterministic Physics Solvers               │
                    │  • Geotechnical: Infinite Slope FoS (Mohr-C) │
                    │  • Hydrological: SCS-CN + Muskingum Routing  │
                    │  • Infiltration: Green-Ampt Wetting Front    │
                    └──────────────────────┬───────────────────────┘
                                           │
                    ┌──────────────────────▼───────────────────────┐
                    │  Physics-Augmented Machine Learning          │
                    │  • XGBoost Landslide Classifier (Platt Scaled│
                    │  • LightGBM Flash Flood Classifier           │
                    │  • Multi-Hazard Compound Coupling Engine     │
                    └──────────────────────┬───────────────────────┘
                                           │
                    ┌──────────────────────▼───────────────────────┐
                    │  FLOWS Unified Mission Control Console       │
                    │  • 153-Day Monsoon Crisis Timeline           │
                    │  • Live OSM Teesta Drainage (92 Reaches)     │
                    │  • Real-Time In-Panel Emergency Directives   │
                    │  • Clicked Coordinate Geocoding & Feeder Path│
                    │  • Population Vulnerability & SMS Broadcasts │
                    └──────────────────────────────────────────────┘
```

---

## 3. Key System Features

### 3.1 153-Day Monsoon Crisis Simulation Engine
- Covers the full high-risk monsoon season (**June 1 to October 31 / 153 Days**).
- Features realistic single-station storm cells and **synoptic multi-region convective storm fronts** (e.g. Days 43–46 across North Sikkim, Days 77–80 in Central Teesta, Days 100–103 in Lower Teesta).
- Scrubbable interactive slider with milestone jumps for June, July, August, September, and October.

### 3.2 Authentic OpenStreetMap River Drainage Engine
- Maps **92 verified OpenStreetMap hydrological reaches** across the Sikkim Teesta basin (Upper Teesta, Lachen Chu, Lachung Chu, Talung, Rangyong, Dik Chu, Rani Khola, Rangpo Chhu).
- External Duars/plains rivers have been strictly filtered out.
- Dynamic hydraulic surge animations activate exclusively on physically contiguous downstream reaches when heavy rainfall triggers discharge overbank thresholds.

### 3.3 Dynamic In-Panel Emergency Directive
- Pinned prominently at the top of the monitoring sites panel (**zero map obstruction**).
- Updates in real-time as the simulation advances or scrubber moves.
- Supports both localized critical failure directives and **Multi-Region Emergency Directives** with quick-focus clickable location chips.

### 3.4 Interactive Custom Location Inspection
- Click anywhere on the map to evaluate custom mountain slopes or valley floors.
- Geocodes elevation, slope gradient, and geotechnical typology.
- Automatically traces a **physical hillside drainage feeder line** to the nearest authentic OSM river reach and models downstream conveyance.

---

## 4. Quick Start Guide (Instant Turnkey Launch)

The repository comes with pre-compiled production frontend distributions committed. **No Node.js or npm installation is required** to run and inspect the full system immediately.

### 4.1 One-Click Launch (Windows)
Double-click **`start_flows.bat`** (or **`run.bat`**).
- Automatically initializes physics & ML models, mounts the pre-built interactive UI, starts the server on `http://localhost:8000`, and opens your default browser.

### 4.2 Cross-Platform Manual Startup (Windows, macOS, Linux)

```bash
# 1. Clone repository
git clone https://github.com/aritra15-06/FLOWS.git
cd FLOWS

# 2. Install Python requirements (one time)
pip install -r requirements.txt

# 3. Launch application
python run.py
```

*Your browser will automatically open to **`http://localhost:8000`** with the full interactive dashboard.*

---

## 5. Frontend Development (Optional — For Source Editing)

If you wish to modify the React frontend source code and rebuild:
```bash
cd frontend
npm install
npm run dev     # Starts Vite development server at http://localhost:5173
npm run build   # Recompiles production bundle into frontend/dist
```

---

## 6. REST API Reference

| HTTP Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | System health, model readiness & server status. |
| `GET` | `/api/locations` | Returns all 6 monitored Himalayan pilot sites with live telemetry. |
| `POST` | `/api/simulate` | Continuous live slider simulation (FoS + calibrated probability). |
| `POST` | `/api/simulate/custom` | Geocodes clicked coordinates, infers parameters & predicts risk. |
| `GET` | `/api/waterways/live` | Returns 92 live OSM Teesta drainage reaches with geometry. |
| `GET` | `/api/sources` | Status and telemetry ping latency of all 10 ingestion feeds. |
| `GET` | `/api/evidence` | Physical evidence ledger and physics equation audit trail. |
| `GET` | `/api/scorecard` | Scientific performance metrics, F1 scores, ROC-AUC, and Brier scores. |

---

## 7. Technical Audit & Scientific Validation

A comprehensive 4-page technical audit report is included in this repository:
- **[`FLOWS_DATA_PHYSICS_ML_AUDIT.pdf`](FLOWS_DATA_PHYSICS_ML_AUDIT.pdf)**: Detailed breakdown of real vs. calculated parameters, soil mechanics equations, SCS hydrological routing, and machine learning calibration.
