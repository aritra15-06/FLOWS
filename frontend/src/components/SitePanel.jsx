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

export function SitePanel() {
  const { selectedLocation } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const [impact, setImpact] = useState(null);
  const [section, setSection] = useState('risk'); // 'risk' | 'flood' | 'impact'
  const [isCouplingModalOpen, setIsCouplingModalOpen] = useState(false);
  const [autoPoppedLocId, setAutoPoppedLocId] = useState(null);

  const locId = selectedLocation?.location_id || selectedLocation?.id;
  const lat = safeNum(selectedLocation?.lat ?? selectedLocation?.latitude, 27.5);
  const lng = safeNum(selectedLocation?.lng ?? selectedLocation?.lon ?? selectedLocation?.longitude, 88.6);

  useEffect(() => {
    if (locId) {
      apiClient.getImpact(locId, lat, lng).then(setImpact).catch(() => {});
    }
  }, [locId, lat, lng]);

  const pred = lastPrediction?.[locId];
  const physOut = pred?.prediction?.physics_output || {};
  const cp = pred?.prediction?.hazards?.compound || {};
  const elevation = selectedLocation?.elevation_m || selectedLocation?.elevation;
  const road = selectedLocation?.primary_road;

  // Auto-trigger Coupling Active Pop-up Menu when severe compound threat is active
  const hasCoupling = (cp.activated_pathways && cp.activated_pathways.length > 0) || selectedLocation?.compound_active;
  useEffect(() => {
    if (hasCoupling && autoPoppedLocId !== locId) {
      setIsCouplingModalOpen(true);
      setAutoPoppedLocId(locId);
    }
  }, [hasCoupling, locId, autoPoppedLocId]);

  if (!selectedLocation) {
    return (
      <div className="right-panel empty-panel">
        <div className="empty-icon">📍</div>
        <p>Select a monitoring site to view details</p>
      </div>
    );
  }

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
            {hasCoupling && (
              <button
                onClick={() => setIsCouplingModalOpen(true)}
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: '#7e22ce',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: '0 1px 3px rgba(126, 34, 206, 0.35)'
                }}
                title="Click to view detailed Cascade Coupling Modal"
              >
                <span>⚡ Coupling Active</span>
              </button>
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
          {section === 'impact' && <ImpactView impact={impact} stabilityState={physOut.stability_state} />}
        </ErrorBoundary>
      </div>

      {/* Interactive Compound Coupling Modal & Trigger */}
      {hasCoupling && (
        <CompoundPathway
          pathways={cp.activated_pathways || ["TOE_EROSION_PLANAR_SLIP"]}
          summary={cp.summary || selectedLocation?.compound_pathway || "High pore pressure & toe erosion coupling active."}
          siteName={selectedLocation.name || locId}
          isOpen={isCouplingModalOpen}
          onClose={() => setIsCouplingModalOpen(false)}
          onOpen={() => setIsCouplingModalOpen(true)}
        />
      )}
    </div>
  );
}

function ImpactView({ impact, stabilityState }) {
  if (!impact) return <div className="loading-text" style={{ padding: 16 }}>Loading geospatial impact telemetry…</div>;
  const villages = impact.affected_villages || [];
  const roads = impact.affected_roads || [];
  const bridges = impact.affected_bridges || [];
  const pop = impact.total_population_at_risk || 0;

  return (
    <div className="impact-view" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Stats Grid */}
      <div className="impact-stat-row">
        <div className="impact-stat">
          <span className="impact-num" style={{ color: 'var(--hazard-critical)' }}>{pop.toLocaleString()}</span>
          <span className="impact-lbl">Exposed Population</span>
        </div>
        <div className="impact-stat">
          <span className="impact-num" style={{ color: 'var(--hazard-warning)' }}>{villages.length}</span>
          <span className="impact-lbl">Settlements at Risk</span>
        </div>
        <div className="impact-stat">
          <span className="impact-num" style={{ color: 'var(--flood-primary)' }}>{roads.length}</span>
          <span className="impact-lbl">Access Corridors</span>
        </div>
        {bridges.length > 0 && (
          <div className="impact-stat">
            <span className="impact-num" style={{ color: '#8b5cf6' }}>{bridges.length}</span>
            <span className="impact-lbl">River Bridges</span>
          </div>
        )}
      </div>

      {/* Affected Settlements Table */}
      {villages.length > 0 && (
        <div className="impact-table-section">
          <div className="impact-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🏘️ Proximity Settlements & Evacuation Tiers</span>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>NDMA Action Priority</span>
          </div>
          <table className="impact-table">
            <thead>
              <tr>
                <th>Village</th>
                <th>Distance</th>
                <th>Pop.</th>
                <th>Action Directive</th>
              </tr>
            </thead>
            <tbody>
              {villages.map((v, i) => {
                const tier = v.tier === 'EVACUATE_NOW' || stabilityState === 'UNSTABLE'
                  ? 'EVACUATE_NOW'
                  : v.tier === 'PREPARE'
                  ? 'PREPARE'
                  : 'WATCH';

                const tierColor = tier === 'EVACUATE_NOW' ? '#dc2626' : tier === 'PREPARE' ? '#d97706' : '#0284c7';
                const tierBg = tier === 'EVACUATE_NOW' ? '#fee2e2' : tier === 'PREPARE' ? '#fef3c7' : '#e0f2fe';
                const tierText = tier === 'EVACUATE_NOW' ? '🚨 EVACUATE NOW' : tier === 'PREPARE' ? '⚠️ PREPARE' : '👁️ WATCH';

                return (
                  <tr key={i}>
                    <td><strong>{v.name || '–'}</strong></td>
                    <td>{v.distance_m != null ? `${(v.distance_m / 1000).toFixed(1)} km` : '–'}</td>
                    <td>{v.population ? v.population.toLocaleString() : '–'}</td>
                    <td>
                      <span style={{
                        color: tierColor,
                        background: tierBg,
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                      }}>
                        {tierText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Roadway & Highway Status */}
      {roads.length > 0 && (
        <div className="impact-table-section">
          <div className="impact-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🛣️ Transportation Corridors & Road Access</span>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>BRO / PWD Status</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {roads.map((r, i) => {
              const isBlocked = r.status === 'BLOCKED' || stabilityState === 'UNSTABLE';
              const isRestricted = !isBlocked && r.status === 'RESTRICTED';
              const statusColor = isBlocked ? '#dc2626' : isRestricted ? '#d97706' : '#16a34a';
              const statusBg = isBlocked ? '#fee2e2' : isRestricted ? '#fef3c7' : '#dcfce7';
              const statusLabel = isBlocked ? '🚨 BLOCKED / DEBRIS DAM' : isRestricted ? '⚠️ RESTRICTED ACCESS' : '✓ CAUTION / OPEN';

              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: '#f8fafc',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.72rem'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong>{r.name || 'Unnamed Corridor'}</strong>
                    <span style={{ color: '#64748b', fontSize: '0.68rem' }}>
                      {r.distance_m != null ? `Proximity: ${(r.distance_m / 1000).toFixed(1)} km to hazard centroid` : 'Direct alignment'}
                    </span>
                  </div>
                  <span style={{
                    color: statusColor,
                    background: statusBg,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Critical River Bridges */}
      {bridges.length > 0 && (
        <div className="impact-table-section">
          <div className="impact-section-title">
            <span>🌉 Critical River Infrastructure</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {bridges.map((b, i) => {
              const isRisk = b.status === 'IMMINENT_COLLAPSE' || b.status === 'SUBMERGENCE_RISK';
              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px',
                    background: isRisk ? '#fdf2f8' : '#f8fafc',
                    borderRadius: 6,
                    border: `1px solid ${isRisk ? '#fbcfe8' : '#e2e8f0'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.72rem'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong>{b.name}</strong>
                    <span style={{ color: '#64748b', fontSize: '0.68rem' }}>
                      Distance: {(b.distance_m / 1000).toFixed(1)} km
                    </span>
                  </div>
                  <span style={{
                    color: isRisk ? '#be185d' : '#0369a1',
                    background: isRisk ? '#fce7f3' : '#e0f2fe',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: '0.66rem'
                  }}>
                    {b.status.replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default SitePanel;
