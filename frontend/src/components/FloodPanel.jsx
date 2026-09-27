import React, { useState } from 'react';
import FloodAnimation from './FloodAnimation';

function fmtN(v, d = 2) { return v != null ? Number(v).toFixed(d) : '–'; }

function buildHydrograph(peakQ = 50, arrivalH = 3, tcH = 2) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i * 0.5;
    let q = 0;
    if (t < arrivalH) {
      q = peakQ * 0.1 * (t / arrivalH);
    } else if (t < arrivalH + tcH) {
      const rise = (t - arrivalH) / tcH;
      q = peakQ * (0.1 + 0.9 * rise);
    } else {
      const fall = (t - arrivalH - tcH) / (12 - arrivalH - tcH);
      q = peakQ * (1 - 0.9 * Math.min(fall, 1));
    }
    pts.push({ t: `${t.toFixed(1)}h`, q: Math.max(0, q) });
  }
  return pts;
}

function HydrographChart({ data, peakQ, bankfullQ }) {
  const W = 320;
  const H = 140;
  const padL = 42;
  const padR = 15;
  const padT = 15;
  const padB = 25;
  const maxQ = Math.max(bankfullQ * 1.25, peakQ * 1.25, 60);
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const points = data.map((pt, i) => {
    const x = padL + (i / (data.length - 1)) * chartW;
    const y = padT + chartH - (pt.q / maxQ) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const areaPoints = `${padL},${padT + chartH} ${points} ${padL + chartW},${padT + chartH}`;
  const bankfullY = padT + chartH - (bankfullQ / maxQ) * chartH;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      {/* Grid Lines */}
      {[0, 0.5, 1.0].map((ratio) => {
        const y = padT + chartH * (1 - ratio);
        const qVal = Math.round(maxQ * ratio);
        return (
          <g key={ratio}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="8" fontWeight="600">{qVal}</text>
          </g>
        );
      })}

      {/* Time axis */}
      {['0h', '2h', '4h', '6h'].map((label, idx) => {
        const x = padL + (idx / 3) * chartW;
        return (
          <text key={label} x={x} y={H - 8} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">{label}</text>
        );
      })}

      {/* Area fill under curve */}
      <polygon points={areaPoints} fill="rgba(14, 165, 233, 0.18)" />

      {/* Bankfull Warning Datum line */}
      {bankfullY >= padT && (
        <g>
          <line x1={padL} y1={bankfullY} x2={W - padR} y2={bankfullY} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3 2" />
          <text x={W - padR} y={bankfullY - 3} textAnchor="end" fill="#ef4444" fontSize="7.5" fontWeight="800">Bankfull ({bankfullQ} m³/s)</text>
        </g>
      )}

      {/* Hydrograph Curve */}
      <polyline points={points} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FloodPanel({ pred }) {
  const [showAnim, setShowAnim] = useState(true);
  const fl = pred?.prediction?.hazards?.flood || {};
  const { probability: flP = 0, peak_discharge_m3s: peakQ = 0, runoff_mm: runoff = 0, arrival_time_hours: arrH = 3, inundation_depth_m: depth = 0 } = fl;
  const hydro = buildHydrograph(peakQ, arrH, 1.5);
  const bankfullQ = 120;

  return (
    <div className="flood-panel">
      {/* Metrics row */}
      <div className="flood-metrics-row">
        <div className="flood-metric">
          <span className="fm-val" style={{ color: flP > 0.6 ? 'var(--hazard-critical)' : 'var(--flood-primary)' }}>{(flP * 100).toFixed(1)}%</span>
          <span className="fm-lbl">Flood Probability</span>
        </div>
        <div className="flood-metric">
          <span className="fm-val" style={{ color: peakQ > bankfullQ ? 'var(--hazard-critical)' : 'var(--flood-primary)' }}>{fmtN(peakQ, 0)}</span>
          <span className="fm-lbl">Peak Q (m³/s)</span>
        </div>
        <div className="flood-metric">
          <span className="fm-val" style={{ color: 'var(--hazard-watch)' }}>{fmtN(runoff, 1)}</span>
          <span className="fm-lbl">Direct Runoff (mm)</span>
        </div>
        <div className="flood-metric">
          <span className="fm-val" style={{ color: arrH < 1 ? 'var(--hazard-critical)' : 'var(--text-primary)' }}>{fmtN(arrH, 1)} h</span>
          <span className="fm-lbl">Arrival Time</span>
        </div>
        <div className="flood-metric">
          <span className="fm-val">{fmtN(depth, 2)} m</span>
          <span className="fm-lbl">Inundation Depth</span>
        </div>
      </div>

      {/* Bankfull warning */}
      {peakQ > bankfullQ && (
        <div className="bankfull-warn">
          ⚠️ Peak discharge exceeds bankfull capacity ({bankfullQ} m³/s) — overbank flooding expected
        </div>
      )}

      {/* Toggle animation / hydrograph */}
      <div className="flood-view-toggle">
        <button className={`fvt-btn ${showAnim ? 'active' : ''}`} onClick={() => setShowAnim(true)}>🌊 Valley Animation</button>
        <button className={`fvt-btn ${!showAnim ? 'active' : ''}`} onClick={() => setShowAnim(false)}>📈 Hydrograph</button>
      </div>

      {showAnim ? (
        <FloodAnimation floodData={fl} />
      ) : (
        <div className="hydro-chart" style={{ padding: '6px 0' }}>
          <HydrographChart data={hydro} peakQ={peakQ} bankfullQ={bankfullQ} />
        </div>
      )}

      {/* HAND depth note */}
      <div className="hand-note">
        HAND-based inundation depth estimate: <b>{fmtN(depth, 2)} m</b> above stream bed at this catchment
      </div>
    </div>
  );
}
