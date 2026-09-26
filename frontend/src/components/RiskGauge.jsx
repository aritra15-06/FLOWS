import React, { useEffect, useState, useRef } from 'react';
import { apiClient } from '../api/client';
import { pilotLocations } from '../data/pilotLocations';
import { useAppContext } from '../state/AppContext';
import { useSimulationContext } from '../state/SimulationContext';

/* ─── helpers ─────────────────────────────── */
function probColor(p) {
  if (p >= 0.8) return 'var(--hazard-critical)';
  if (p >= 0.6) return 'var(--hazard-warning)';
  if (p >= 0.3) return 'var(--hazard-watch)';
  return 'var(--hazard-safe)';
}
function actionColor(action) {
  const m = { EMERGENCY: 'var(--hazard-critical)', WARNING: 'var(--hazard-warning)', WATCH: 'var(--hazard-watch)', ADVISORY: 'var(--hazard-safe)' };
  return m[action] || 'var(--text-secondary)';
}
function fmtP(p) { return p != null ? (p * 100).toFixed(1) + '%' : '–'; }
function fmtN(v, d = 2) { return v != null ? Number(v).toFixed(d) : '–'; }

/* ─── SVG arc gauge ───────────────────────── */
function ArcGauge({ value, color, label, size = 80 }) {
  const r = size * 0.38;
  const cx = size / 2, cy = size / 2;
  const startAngle = -210, totalAngle = 240;
  const clampedVal = Math.max(0, Math.min(0.999, value || 0));
  const angleSpan = clampedVal * totalAngle;
  const angle = startAngle + angleSpan;
  const toXY = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const s = toXY(startAngle), e = toXY(angle), bg2 = toXY(startAngle + totalAngle);
  const largeArc = angleSpan > 180 ? 1 : 0;
  const bgLarge = totalAngle > 180 ? 1 : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* track */}
      <path d={`M${s.x},${s.y} A${r},${r} 0 ${bgLarge} 1 ${bg2.x},${bg2.y}`}
        stroke="#e2e8f0" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      {/* fill */}
      {clampedVal > 0.01 && (
        <path d={`M${s.x},${s.y} A${r},${r} 0 ${largeArc} 1 ${e.x},${e.y}`}
          stroke={color} strokeWidth="5.5" fill="none" strokeLinecap="round" />
      )}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.18} fill={color} fontWeight="700">
        {((value || 0) * 100).toFixed(0)}%
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={size * 0.1} fill="var(--text-secondary)">
        {label}
      </text>
    </svg>
  );
}

/* ─── SHAP bar row ────────────────────────── */
function ShapRow({ feature, contribution }) {
  const pos = contribution > 0;
  const pct = Math.min(Math.abs(contribution) * 200, 100);
  return (
    <div className="shap-row">
      <span className="shap-feat">{feature.replace(/_/g, ' ')}</span>
      <div className="shap-bar-bg">
        <div className="shap-bar" style={{ width: pct + '%', background: pos ? 'var(--hazard-warning)' : 'var(--confidence-high)' }} />
      </div>
      <span className="shap-val" style={{ color: pos ? 'var(--hazard-warning)' : 'var(--confidence-high)' }}>
        {pos ? '+' : ''}{contribution.toFixed(3)}
      </span>
    </div>
  );
}

/* ─── main RiskGauge ──────────────────────── */
export default function RiskGauge() {
  const { selectedLocation } = useAppContext();
  const { lastPrediction, setLastPrediction, overrides } = useSimulationContext();
  const [loading, setLoading] = useState(false);
  const [sliders, setSliders] = useState({ rainfall_24h_mm: 65, initial_saturation_0_1: 0.45, slope_deg: 34 });
  const [simMode, setSimMode] = useState(false);
  const debounceRef = useRef(null);

  const locId = selectedLocation?.location_id || selectedLocation?.id;

  async function fetchPrediction(sid, ovr = {}) {
    if (!sid) return;
    setLoading(true);
    try {
      const data = await apiClient.simulate(sid, ovr);
      setLastPrediction(prev => ({ ...prev, [sid]: data }));
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    if (locId) fetchPrediction(locId, {});
    // eslint-disable-next-line
  }, [locId]);

  function handleSlider(key, val) {
    const newSliders = { ...sliders, [key]: val };
    setSliders(newSliders);
    if (!simMode) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPrediction(locId, newSliders), 400);
  }

  function applyOverrides() {
    fetchPrediction(locId, sliders);
  }

  const pred = lastPrediction[locId];
  const hazards = pred?.prediction?.hazards || {};
  const ls = hazards.landslide || {};
  const fl = hazards.flood || {};
  const cp = hazards.compound || {};
  const physOut = pred?.prediction?.physics_output || {};
  const action = pred?.action || {};
  const confidence = pred?.confidence || {};
  const severity = pred?.severity || {};

  const lsP = ls.probability || 0;
  const flP = fl.probability || 0;
  const cpP = cp.probability || 0;
  const fos = physOut.factor_of_safety;
  const fosColor = fos == null ? 'var(--text-secondary)' : fos < 1 ? 'var(--hazard-critical)' : fos < 1.5 ? 'var(--hazard-watch)' : 'var(--hazard-safe)';
  const fosState = physOut.stability_state || '–';

  const sliderDefs = [
    { key: 'rainfall_24h_mm', label: '24h Rainfall', min: 0, max: 350, step: 5, unit: 'mm' },
    { key: 'initial_saturation_0_1', label: 'Soil Saturation', min: 0, max: 1, step: 0.05, unit: '' },
    { key: 'slope_deg', label: 'Slope Angle', min: 5, max: 65, step: 1, unit: '°' },
  ];

  const pathways = cp.activated_pathways || [];

  return (
    <div className="risk-gauge-panel">
      {/* Header */}
      <div className="gauge-header">
        <span className="gauge-title">Hazard Assessment</span>
        {loading && <span className="spinner-dot" />}
        <span className="conf-badge" style={{
          background: confidence.confidence_band === 'HIGH' ? '#dcfce7' : confidence.confidence_band === 'MEDIUM' ? '#fef3c7' : '#fee2e2',
          color: confidence.confidence_band === 'HIGH' ? '#15803d' : confidence.confidence_band === 'MEDIUM' ? '#b45309' : '#b91c1c',
          border: `1px solid ${confidence.confidence_band === 'HIGH' ? '#86efac' : confidence.confidence_band === 'MEDIUM' ? '#fcd34d' : '#fca5a5'}`
        }}>
          {confidence.confidence_band || '–'} CONFIDENCE
        </span>
      </div>

      {/* Three arc gauges */}
      <div className="gauge-row">
        <div className="gauge-item">
          <ArcGauge value={lsP} color={probColor(lsP)} label="Landslide" />
        </div>
        <div className="gauge-item">
          <ArcGauge value={flP} color="var(--flood-primary)" label="Flash Flood" />
        </div>
        <div className="gauge-item">
          <ArcGauge value={cpP} color={pathways.length > 0 ? 'var(--compound-primary)' : probColor(cpP)} label="Compound" />
        </div>
      </div>

      {/* FoS row */}
      <div className="fos-row">
        <div className="fos-box">
          <span className="fos-label">Factor of Safety</span>
          <span className="fos-value" style={{ color: fosColor }}>{fmtN(fos, 3)}</span>
          <span className="fos-state" style={{ color: fosColor }}>{fosState}</span>
        </div>
        <div className="fos-box">
          <span className="fos-label">Peak Discharge</span>
          <span className="fos-value" style={{ color: 'var(--flood-primary)' }}>{fmtN(fl.peak_discharge_m3s, 1)} m³/s</span>
          <span className="fos-state" style={{ color: 'var(--text-secondary)' }}>Arrival {fmtN(fl.arrival_time_hours, 1)} h</span>
        </div>
        <div className="fos-box">
          <span className="fos-label">Severity</span>
          <span className="fos-value" style={{ color: probColor(lsP) }}>{severity.band || '–'}</span>
          <span className="fos-state">{fmtN(severity.score_0_100, 0)}/100</span>
        </div>
      </div>

      {/* Compound pathway */}
      {pathways.length > 0 && (
        <div className="pathway-mini">
          <span className="pathway-label">⚡ Active Compound Pathway</span>
          <div className="pathway-chain">
            {pathways.map((p, i) => (
              <React.Fragment key={p}>
                <span className="pathway-node active">{p.replace(/_/g, ' ')}</span>
                {i < pathways.length - 1 && <span className="pathway-arrow">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Action card */}
      {action.action && (
        <div className="action-mini" style={{ borderLeft: `3px solid ${actionColor(action.action)}` }}>
          <span className="action-level" style={{ color: actionColor(action.action) }}>⚠ {action.action}</span>
          <p className="action-msg">{action.citizen_message}</p>
        </div>
      )}

      {/* SHAP drivers */}
      {(ls.drivers || []).length > 0 && (
        <div className="shap-section">
          <div className="shap-title">Top Risk Drivers (Landslide)</div>
          {(ls.drivers || []).slice(0, 4).map(d => (
            <ShapRow key={d.feature} feature={d.feature} contribution={d.contribution} />
          ))}
        </div>
      )}

      {/* Simulation sliders */}
      <div className="slider-section">
        <div className="slider-header">
          <span>Parameter Override</span>
          <label className="toggle-label">
            <input type="checkbox" checked={simMode} onChange={e => setSimMode(e.target.checked)} />
            Live Sim
          </label>
        </div>
        {sliderDefs.map(({ key, label, min, max, step, unit }) => (
          <div className="slider-row" key={key}>
            <span className="slider-label">{label}</span>
            <input type="range" min={min} max={max} step={step} value={sliders[key]}
              onChange={e => handleSlider(key, parseFloat(e.target.value))} className="slider" />
            <span className="slider-val">{sliders[key]}{unit}</span>
          </div>
        ))}
        <button className="apply-btn" onClick={applyOverrides}>Apply Parameters</button>
      </div>
    </div>
  );
}
