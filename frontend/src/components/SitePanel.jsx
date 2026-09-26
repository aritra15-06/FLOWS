import React, { useEffect, useState } from 'react';
import { useAppContext } from '../state/AppContext';
import { useSimulationContext } from '../state/SimulationContext';
import RiskGauge from './RiskGauge';
import CompoundPathway from './CompoundPathway';
import FloodPanel from './FloodPanel';
import ErrorBoundary from './ErrorBoundary';
import { apiClient } from '../api/client';

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export default function SitePanel() {
  const { selectedLocation } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const [impact, setImpact] = useState(null);
  const [section, setSection] = useState('risk'); // 'risk' | 'flood' | 'impact'

  const locId = selectedLocation?.location_id || selectedLocation?.id;

  useEffect(() => {
    if (locId) {
      apiClient.getImpact(locId).then(setImpact).catch(() => {});
    }
  }, [locId]);

  if (!selectedLocation) {
    return (
      <div className="right-panel empty-panel">
        <div className="empty-icon">📍</div>
        <p>Select a monitoring site to view details</p>
      </div>
    );
  }

  const pred = lastPrediction?.[locId];
  const physOut = pred?.prediction?.physics_output || {};
  const cp = pred?.prediction?.hazards?.compound || {};
  const elevation = selectedLocation.elevation_m || selectedLocation.elevation;
  const road = selectedLocation.primary_road;
  const lat = safeNum(selectedLocation.lat ?? selectedLocation.latitude, 27.5);
  const lng = safeNum(selectedLocation.lng ?? selectedLocation.lon ?? selectedLocation.longitude, 88.6);

  return (
    <div className="right-panel">
      {/* Site header */}
      <div className="site-header">
        <div className="site-header-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 className="site-heading" style={{ margin: 0 }}>{selectedLocation.name || locId}</h2>
            {selectedLocation.hazard_typology && (
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background: selectedLocation.hazard_typology === 'COMPOUND' ? '#f3e8ff' : selectedLocation.hazard_typology === 'LANDSLIDE_ONLY' ? '#fef3c7' : '#e0f2fe',
                color: selectedLocation.hazard_typology === 'COMPOUND' ? '#7e22ce' : selectedLocation.hazard_typology === 'LANDSLIDE_ONLY' ? '#b45309' : '#0369a1',
                border: `1px solid ${selectedLocation.hazard_typology === 'COMPOUND' ? '#d8b4fe' : selectedLocation.hazard_typology === 'LANDSLIDE_ONLY' ? '#fcd34d' : '#bae6fd'}`
              }}>
                {selectedLocation.hazard_typology === 'COMPOUND' ? '🔮 Compound Gorge' : selectedLocation.hazard_typology === 'LANDSLIDE_ONLY' ? '🏔️ Alpine Ridge Cut' : '🌊 Valley Basin Flat'}
              </span>
            )}
          </div>
          <div className="site-meta" style={{ marginTop: 4 }}>
            <span>📍 {lat.toFixed(3)}°N, {lng.toFixed(3)}°E</span>
            {elevation && <span> · ⛰ {elevation}m</span>}
            {road && <span> · 🛣 {road}</span>}
          </div>
        </div>
        <div className="site-fos-pill" style={{
          background: physOut.stability_state === 'UNSTABLE' ? '#fee2e2' : physOut.stability_state === 'MARGINAL' ? '#fef3c7' : '#dcfce7',
          color: physOut.stability_state === 'UNSTABLE' ? '#b91c1c' : physOut.stability_state === 'MARGINAL' ? '#b45309' : '#15803d',
          border: `1px solid ${physOut.stability_state === 'UNSTABLE' ? '#fca5a5' : physOut.stability_state === 'MARGINAL' ? '#fcd34d' : '#86efac'}`,
        }}>
          FoS {Number.isFinite(Number(physOut.factor_of_safety)) ? Number(physOut.factor_of_safety).toFixed(2) : '–'}
          <br /><span style={{ fontSize: '0.65rem' }}>{physOut.stability_state || '–'}</span>
        </div>
      </div>

      {/* Section tabs */}
      <div className="panel-tabs">
        {[['risk', '📊 Risk'], ['flood', '🌊 Flood'], ['impact', '🏘 Impact']].map(([k, l]) => (
          <button key={k} className={`panel-tab ${section === k ? 'active' : ''}`} onClick={() => setSection(k)}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div className="panel-content">
        <ErrorBoundary fallbackMessage="Error loading details for this tab.">
          {section === 'risk' && <RiskGauge />}
          {section === 'flood' && <FloodPanel pred={pred} />}
          {section === 'impact' && <ImpactView impact={impact} />}
        </ErrorBoundary>
      </div>

      {/* Compound pathway strip */}
      {cp.activated_pathways?.length > 0 && (
        <CompoundPathway pathways={cp.activated_pathways} summary={cp.summary} />
      )}
    </div>
  );
}

function ImpactView({ impact }) {
  if (!impact) return <div className="loading-text">Loading impact data…</div>;
  const villages = impact.affected_villages || [];
  const roads = impact.affected_roads || [];
  const pop = impact.total_population_at_risk || 0;

  return (
    <div className="impact-view">
      <div className="impact-stat-row">
        <div className="impact-stat">
          <span className="impact-num" style={{ color: 'var(--hazard-warning)' }}>{villages.length}</span>
          <span className="impact-lbl">Villages at risk</span>
        </div>
        <div className="impact-stat">
          <span className="impact-num" style={{ color: 'var(--hazard-critical)' }}>{pop.toLocaleString()}</span>
          <span className="impact-lbl">People exposed</span>
        </div>
        <div className="impact-stat">
          <span className="impact-num" style={{ color: 'var(--flood-primary)' }}>{roads.length}</span>
          <span className="impact-lbl">Roads affected</span>
        </div>
      </div>

      {villages.length > 0 && (
        <div className="impact-table-section">
          <div className="impact-section-title">Affected Settlements</div>
          <table className="impact-table">
            <thead><tr><th>Village</th><th>Distance</th><th>Pop.</th><th>Tier</th></tr></thead>
            <tbody>
              {villages.map((v, i) => (
                <tr key={i}>
                  <td>{v.name || '–'}</td>
                  <td>{v.distance_m ? (v.distance_m / 1000).toFixed(1) + ' km' : '–'}</td>
                  <td>{v.population || '–'}</td>
                  <td>
                    <span style={{
                      color: v.tier === 'EVACUATE_NOW' ? 'var(--hazard-critical)' : v.tier === 'PREPARE' ? 'var(--hazard-warning)' : 'var(--hazard-watch)',
                      fontSize: '0.7rem', fontWeight: 600,
                    }}>{v.tier}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {roads.length > 0 && (
        <div className="impact-table-section">
          <div className="impact-section-title">Road Status</div>
          {roads.map((r, i) => (
            <div key={i} className="road-row">
              <span className="road-name">{r.name || r.ref || 'Unnamed Road'}</span>
              <span className="road-status" style={{ color: r.status === 'BLOCKED' ? 'var(--hazard-critical)' : 'var(--hazard-watch)' }}>
                {r.status}
              </span>
              <span className="road-dist">{r.distance_m ? (r.distance_m / 1000).toFixed(1) + ' km' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
