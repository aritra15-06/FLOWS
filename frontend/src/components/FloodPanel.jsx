import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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
          ⚠ Peak discharge exceeds bankfull capacity ({bankfullQ} m³/s) — overbank flooding expected
        </div>
      )}

      {/* Toggle animation / hydrograph */}
      <div className="flood-view-toggle">
        <button className={`fvt-btn ${showAnim ? 'active' : ''}`} onClick={() => setShowAnim(true)}>Valley Animation</button>
        <button className={`fvt-btn ${!showAnim ? 'active' : ''}`} onClick={() => setShowAnim(false)}>Hydrograph</button>
      </div>

      {showAnim ? (
        <FloodAnimation floodData={fl} />
      ) : (
        <div className="hydro-chart">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={hydro} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={40} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} formatter={(v) => [`${v.toFixed(0)} m³/s`, 'Discharge']} />
              {peakQ > 5 && (
                <ReferenceLine y={bankfullQ} stroke="rgba(239,68,68,0.6)" strokeDasharray="4 2" label={{ value: 'Bankfull', fill: '#ef4444', fontSize: 9 }} />
              )}
              <Line type="monotone" dataKey="q" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HAND depth note */}
      <div className="hand-note">
        HAND-based inundation depth estimate: <b>{fmtN(depth, 2)} m</b> above stream bed at this catchment
      </div>
    </div>
  );
}
