import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { pilotLocations } from '../data/pilotLocations';
import { useAppContext } from '../state/AppContext';
import { useSimulationContext } from '../state/SimulationContext';

function probColor(p) {
  if (p >= 0.8) return 'var(--hazard-critical)';
  if (p >= 0.6) return 'var(--hazard-warning)';
  if (p >= 0.3) return 'var(--hazard-watch)';
  return 'var(--hazard-safe)';
}

export default function SiteList() {
  const { selectedLocation, setSelectedLocation } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const [locations, setLocations] = useState(pilotLocations);

  useEffect(() => {
    apiClient.getLocations().then(data => {
      if (data && data.length > 0) {
        // merge API data with local fallback
        setLocations(data.map(l => ({
          ...l,
          id: l.location_id || l.id,
          lat: l.lat || l.latitude,
          lng: l.lng || l.longitude,
        })));
      }
    });
  }, []);

  return (
    <div className="sidebar site-list">
      <div className="sidebar-header">
        <span className="sidebar-title">🗺 Monitoring Sites</span>
        <span className="site-count">{locations.length} sites</span>
      </div>
      <div className="list-container">
        {locations.map(loc => {
          const locId = loc.location_id || loc.id;
          const pred = lastPrediction[locId];
          const lsP = pred?.prediction?.hazards?.landslide?.probability || 0;
          const flP = pred?.prediction?.hazards?.flood?.probability || 0;
          const action = pred?.action?.action || 'ADVISORY';
          const fosState = pred?.prediction?.physics_output?.stability_state || 'STABLE';
          return (
            <div
              key={locId}
              className={`site-card ${(selectedLocation?.location_id || selectedLocation?.id) === locId ? 'active' : ''}`}
              onClick={() => setSelectedLocation(loc)}
            >
              <div className="site-card-top">
                <div className="site-dot" style={{ background: probColor(Math.max(lsP, flP)) }} />
                <span className="site-name">{loc.name}</span>
                <span className="site-action" style={{ color: action === 'EMERGENCY' ? 'var(--hazard-critical)' : action === 'WARNING' ? 'var(--hazard-warning)' : action === 'WATCH' ? 'var(--hazard-watch)' : 'var(--hazard-safe)', fontSize: '0.65rem' }}>
                  {action}
                </span>
              </div>
              <div className="site-mini-bars">
                <div className="mini-bar-row">
                  <span className="mini-bar-label">LS</span>
                  <div className="mini-bar-bg">
                    <div className="mini-bar-fill" style={{ width: (lsP * 100) + '%', background: probColor(lsP) }} />
                  </div>
                  <span className="mini-bar-pct">{(lsP * 100).toFixed(0)}%</span>
                </div>
                <div className="mini-bar-row">
                  <span className="mini-bar-label">FL</span>
                  <div className="mini-bar-bg">
                    <div className="mini-bar-fill" style={{ width: (flP * 100) + '%', background: 'var(--flood-primary)' }} />
                  </div>
                  <span className="mini-bar-pct">{(flP * 100).toFixed(0)}%</span>
                </div>
              </div>
              {fosState !== 'STABLE' && (
                <div className="site-fos-warn">{fosState}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--hazard-safe)' }} /> Safe</div>
        <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--hazard-watch)' }} /> Watch</div>
        <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--hazard-warning)' }} /> Warning</div>
        <div className="legend-row"><span className="legend-dot" style={{ background: 'var(--hazard-critical)' }} /> Emergency</div>
      </div>
    </div>
  );
}
