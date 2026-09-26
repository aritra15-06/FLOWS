import React from 'react';
import { useSimulationContext } from '../state/SimulationContext';
import { useAppContext } from '../state/AppContext';

function actionColor(action) {
  const m = { EMERGENCY: 'var(--hazard-critical)', WARNING: 'var(--hazard-warning)', WATCH: 'var(--hazard-watch)', ADVISORY: 'var(--hazard-safe)' };
  return m[action] || 'var(--text-secondary)';
}
function actionBg(action) {
  const m = { EMERGENCY: '#450a0a', WARNING: '#451a03', WATCH: '#422006', ADVISORY: '#052e16' };
  return m[action] || '#1e2d4a';
}

export default function ActionCard() {
  const { selectedLocation } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const locId = selectedLocation?.location_id || selectedLocation?.id;
  const pred = lastPrediction[locId];
  const action = pred?.action || {};
  const severity = pred?.severity || {};
  const actionLevel = action.action || 'ADVISORY';
  const color = actionColor(actionLevel);
  const bg = actionBg(actionLevel);

  const ICONS = { EMERGENCY: '🚨', WARNING: '⚠', WATCH: '👁', ADVISORY: 'ℹ' };

  return (
    <div className="action-card" style={{ background: bg, borderLeft: `4px solid ${color}` }}>
      <div className="action-header">
        <span className="action-icon">{ICONS[actionLevel]}</span>
        <span className="action-level-text" style={{ color }}>{actionLevel}</span>
        {severity.band && (
          <span className="severity-badge" style={{ color, border: `1px solid ${color}` }}>
            {severity.band} ({severity.score_0_100?.toFixed(0) || '–'}/100)
          </span>
        )}
      </div>

      {action.citizen_message && (
        <div className="action-citizen-msg">
          <div className="action-msg-label">Citizen Advisory</div>
          <p className="action-msg-text">{action.citizen_message}</p>
        </div>
      )}

      {action.responder_action && (
        <div className="action-responder">
          <div className="action-msg-label">Responder Action</div>
          <p className="action-msg-text">{action.responder_action}</p>
        </div>
      )}

      {/* Auth status row */}
      <div className="action-auth-row">
        <span className="auth-badge draft">DRAFT</span>
        <span className="auth-note">Pending operator authorization</span>
      </div>
    </div>
  );
}
