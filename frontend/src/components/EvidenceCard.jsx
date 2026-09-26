import React from 'react';
import { useSimulationContext } from '../state/SimulationContext';
import { useAppContext } from '../state/AppContext';

function ConfidenceBadge({ band }) {
  const colors = { HIGH: ['#052e16', 'var(--confidence-high)'], MEDIUM: ['#422006', 'var(--confidence-medium)'], LOW: ['#450a0a', 'var(--confidence-low)'] };
  const [bg, fg] = colors[band] || ['#1e2d4a', 'var(--text-secondary)'];
  return (
    <span style={{ background: bg, color: fg, border: `1px solid ${fg}`, borderRadius: 3, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
      {band || '–'} CONFIDENCE
    </span>
  );
}

export default function EvidenceCard() {
  const { selectedLocation } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const locId = selectedLocation?.location_id || selectedLocation?.id;
  const pred = lastPrediction[locId];
  const drivers = pred?.prediction?.hazards?.landslide?.drivers || [];
  const confidence = pred?.confidence || {};
  const physOut = pred?.prediction?.physics_output || {};

  const SOURCES = [
    { name: 'Satellite DEM (Copernicus/SRTM)', freshness: 'Live DEM', quality: 'HIGH', icon: '🏔' },
    { name: 'Satellite Orthophoto (Esri ArcGIS)', freshness: 'Sub-meter', quality: 'HIGH', icon: '🛰' },
    { name: 'Drainage Network (OSM Overpass)', freshness: 'Live QL', quality: 'HIGH', icon: '🌊' },
    { name: 'Base Cartography (OpenStreetMap)', freshness: 'Live Vector', quality: 'HIGH', icon: '🗺' },
  ];

  const qualityColor = q => q === 'HIGH' ? 'var(--confidence-high)' : q === 'MEDIUM' ? 'var(--confidence-medium)' : 'var(--confidence-low)';

  return (
    <div className="evidence-card">
      <div className="ev-header">
        <span className="ev-title">📋 Evidence & SHAP Factors</span>
        <ConfidenceBadge band={confidence.confidence_band} />
      </div>

      {/* Physics parameters */}
      <div className="ev-physics">
        <div className="ev-phys-item">
          <span className="ep-label">Effective Saturation</span>
          <div className="ep-bar-bg">
            <div className="ep-bar-fill" style={{ width: ((physOut.effective_saturation || 0) * 100) + '%', background: 'var(--flood-primary)' }} />
          </div>
          <span className="ep-val">{((physOut.effective_saturation || 0) * 100).toFixed(0)}%</span>
        </div>
        <div className="ev-phys-item">
          <span className="ep-label">Pore Pressure</span>
          <div className="ep-bar-bg">
            <div className="ep-bar-fill" style={{ width: Math.min((physOut.pore_pressure_kpa || 0) * 4, 100) + '%', background: 'var(--hazard-warning)' }} />
          </div>
          <span className="ep-val">{(physOut.pore_pressure_kpa || 0).toFixed(1)} kPa</span>
        </div>
        <div className="ev-phys-item">
          <span className="ep-label">Infiltration Rate</span>
          <div className="ep-bar-bg">
            <div className="ep-bar-fill" style={{ width: Math.min((physOut.infiltration_rate_mm_h || 0) * 2, 100) + '%', background: 'var(--compound-primary)' }} />
          </div>
          <span className="ep-val">{(physOut.infiltration_rate_mm_h || 0).toFixed(1)} mm/h</span>
        </div>
      </div>

      {/* SHAP drivers */}
      {drivers.length > 0 && (
        <div className="ev-shap">
          <div className="ev-shap-title">Top Risk Drivers</div>
          {drivers.slice(0, 5).map(d => {
            const pos = d.contribution > 0;
            const pct = Math.min(Math.abs(d.contribution) * 250, 100);
            return (
              <div key={d.feature} className="shap-row">
                <span className="shap-feat">{d.feature.replace(/_/g, ' ')}</span>
                <div className="shap-bar-bg">
                  <div className="shap-bar" style={{ width: pct + '%', background: pos ? 'var(--hazard-warning)' : 'var(--confidence-high)' }} />
                </div>
                <span className="shap-val" style={{ color: pos ? 'var(--hazard-warning)' : 'var(--confidence-high)' }}>
                  {pos ? '+' : ''}{d.contribution.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Source freshness */}
      <div className="ev-sources">
        <div className="ev-sources-title">Data Freshness</div>
        {SOURCES.map(s => (
          <div key={s.name} className="ev-source-row">
            <span className="ev-src-icon">{s.icon}</span>
            <span className="ev-src-name">{s.name}</span>
            <span className="ev-src-fresh">{s.freshness}</span>
            <span className="ev-src-quality" style={{ color: qualityColor(s.quality) }}>{s.quality}</span>
          </div>
        ))}
      </div>

      {/* Confidence reasons */}
      {(confidence.reasons || []).length > 0 && (
        <div className="ev-reasons">
          {confidence.reasons.map((r, i) => <div key={i} className="ev-reason">• {r}</div>)}
        </div>
      )}
    </div>
  );
}
