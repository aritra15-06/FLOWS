import React, { useState } from 'react';
import { useSimulationContext } from '../state/SimulationContext';
import { useAppContext } from '../state/AppContext';
import { apiClient } from '../api/client';
import { pilotLocations } from '../data/pilotLocations';

const LANGS = ['English', 'Hindi', 'Nepali', 'Bengali'];
const TEMPLATES = {
  English: (site, action) => `⚠ FLOWS ALERT — ${action}: Hazardous conditions detected near ${site}. ${action === 'EMERGENCY' ? 'EVACUATE IMMEDIATELY to designated safe zones. Do not use low-lying roads.' : action === 'WARNING' ? 'Prepare to evacuate. Avoid flood-prone areas and steep slopes.' : 'Stay alert. Monitor local announcements. Avoid river banks and unstable slopes.'}`,
  Hindi: (site, action) => `⚠ FLOWS अलर्ट — ${action}: ${site} के पास खतरनाक स्थिति। ${action === 'EMERGENCY' ? 'तुरंत सुरक्षित स्थान पर जाएं!' : 'सावधान रहें और स्थानीय अधिकारियों के निर्देशों का पालन करें।'}`,
  Nepali: (site, action) => `⚠ FLOWS सूचना — ${action}: ${site} नजिक खतरनाक अवस्था। ${action === 'EMERGENCY' ? 'तुरुन्तै सुरक्षित स्थानमा जानुहोस्!' : 'सतर्क रहनुहोस् र स्थानीय अधिकारीहरूको निर्देशन पालना गर्नुहोस्।'}`,
  Bengali: (site, action) => `⚠ FLOWS সতর্কতা — ${action}: ${site} এর কাছে বিপজ্জনক পরিস্থিতি। ${action === 'EMERGENCY' ? 'অবিলম্বে নিরাপদ স্থানে যান!' : 'সতর্ক থাকুন এবং স্থানীয় কর্তৃপক্ষের নির্দেশ মেনে চলুন।'}`,
};

export default function AlertPanel() {
  const { selectedLocation } = useAppContext();
  const { lastPrediction } = useSimulationContext();
  const [lang, setLang] = useState('English');
  const [dryRun, setDryRun] = useState(true);
  const [sentAlerts, setSentAlerts] = useState([]);
  const [sending, setSending] = useState(false);

  const locId = selectedLocation?.location_id || selectedLocation?.id;
  const pred = lastPrediction[locId];
  const action = pred?.action?.action || 'ADVISORY';
  const siteName = selectedLocation?.name || 'Selected Site';
  const lsP = pred?.prediction?.hazards?.landslide?.probability || 0;
  const flP = pred?.prediction?.hazards?.flood?.probability || 0;
  const cpP = pred?.prediction?.hazards?.compound?.probability || 0;
  const message = TEMPLATES[lang](siteName, action);

  async function sendAlert() {
    setSending(true);
    const payload = { location_id: locId, action, message, dry_run: dryRun, language: lang };
    try {
      await apiClient.sendAlert(payload);
    } catch {}
    setSentAlerts(prev => [{
      time: new Date().toLocaleTimeString(),
      location: siteName,
      action,
      language: lang,
      dryRun,
      message,
    }, ...prev.slice(0, 14)]);
    setSending(false);
  }

  const actionColor = action === 'EMERGENCY' ? 'var(--hazard-critical)' : action === 'WARNING' ? 'var(--hazard-warning)' : action === 'WATCH' ? 'var(--hazard-watch)' : 'var(--hazard-safe)';

  return (
    <div className="alert-panel">
      <div className="alert-panel-header">
        <h2>📢 Alert Dispatch Console</h2>
        <p className="alert-sub">Multi-channel, multilingual emergency alert broadcasting</p>
      </div>

      {/* Current status */}
      <div className="alert-status-card" style={{ borderLeft: `4px solid ${actionColor}` }}>
        <div className="alert-site-name">{siteName || 'No site selected'}</div>
        <div className="alert-action" style={{ color: actionColor }}>Current Status: <b>{action}</b></div>
        <div className="alert-probs">
          <span>🏔 LS: {(lsP * 100).toFixed(1)}%</span>
          <span>🌊 FL: {(flP * 100).toFixed(1)}%</span>
          <span>⚡ CP: {(cpP * 100).toFixed(1)}%</span>
        </div>
        {pred?.action?.citizen_message && (
          <div className="alert-citizen-msg">{pred.action.citizen_message}</div>
        )}
      </div>

      {/* Configuration */}
      <div className="alert-config">
        <div className="alert-config-row">
          <label>Language:</label>
          <div className="lang-btns">
            {LANGS.map(l => (
              <button key={l} className={`lang-btn ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="alert-config-row">
          <label>Mode:</label>
          <label className="toggle-label">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
            <span className={`dry-run-badge ${dryRun ? 'dry' : 'live'}`}>{dryRun ? '🔵 Dry-Run (Preview)' : '🔴 Live Send'}</span>
          </label>
        </div>
      </div>

      {/* Message preview */}
      <div className="alert-preview">
        <div className="alert-preview-title">Message Preview ({lang})</div>
        <div className="alert-preview-text">{message}</div>
      </div>

      {/* Send button */}
      <button className="send-alert-btn" style={{ background: actionColor, opacity: !locId ? 0.5 : 1 }}
        disabled={!locId || sending} onClick={sendAlert}>
        {sending ? '⏳ Sending…' : dryRun ? '👁 Preview Send (Dry Run)' : '📤 Send Alert Now'}
      </button>

      {/* Alert history */}
      {sentAlerts.length > 0 && (
        <div className="alert-history">
          <div className="alert-history-title">📋 Alert History ({sentAlerts.length})</div>
          <div className="alert-history-list">
            {sentAlerts.map((a, i) => (
              <div key={i} className={`alert-history-row ${a.action}`}>
                <span className="ah-time">{a.time}</span>
                <span className="ah-loc">{a.location}</span>
                <span className="ah-action" style={{ color: a.action === 'EMERGENCY' ? 'var(--hazard-critical)' : a.action === 'WARNING' ? 'var(--hazard-warning)' : 'var(--hazard-watch)' }}>{a.action}</span>
                <span className="ah-lang">{a.language}</span>
                {a.dryRun && <span className="ah-dry">DRY</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
