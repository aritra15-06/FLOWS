import React from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';

const MOCK_EVENTS = [
  { id: 'EVT-001', date: '2023-10-04', site: 'Chungthang', predicted_action: 'EMERGENCY', actual_outcome: 'MAJOR FLOOD', lead_time_h: 5.2, ls_prob_pred: 0.82, flood_prob_pred: 0.91, fos_pred: 0.72, detected: true, false_alarm: false },
  { id: 'EVT-002', date: '2023-08-16', site: 'Mangan', predicted_action: 'WARNING', actual_outcome: 'MODERATE LS', lead_time_h: 3.8, ls_prob_pred: 0.67, flood_prob_pred: 0.32, fos_pred: 1.01, detected: true, false_alarm: false },
  { id: 'EVT-003', date: '2023-07-22', site: 'Lachung', predicted_action: 'WATCH', actual_outcome: 'MINOR EVENT', lead_time_h: 0, ls_prob_pred: 0.41, flood_prob_pred: 0.25, fos_pred: 1.35, detected: false, false_alarm: false },
  { id: 'EVT-004', date: '2023-09-11', site: 'Dikchu', predicted_action: 'WARNING', actual_outcome: 'NO EVENT', lead_time_h: 0, ls_prob_pred: 0.71, flood_prob_pred: 0.55, fos_pred: 0.98, detected: false, false_alarm: true },
];

const METRIC_LABELS = {
  detection_rate: 'Detection Rate',
  false_alarm_rate: 'False Alarm Rate (inv)',
  lead_time: 'Lead Time',
  brier_score: 'Brier Score (inv)',
  precision: 'Precision',
};

function computeMetrics(events) {
  const detected = events.filter(e => e.detected && !e.false_alarm).length;
  const fa = events.filter(e => e.false_alarm).length;
  const total = events.length;
  const detection_rate = detected / total;
  const false_alarm_rate = fa / total;
  const avg_lead = events.filter(e => e.detected).reduce((s, e) => s + e.lead_time_h, 0) / (events.filter(e => e.detected).length || 1);
  const brier = events.reduce((s, e) => {
    const actual = (e.detected && !e.false_alarm) ? 1 : 0;
    return s + Math.pow((e.ls_prob_pred + e.flood_prob_pred) / 2 - actual, 2);
  }, 0) / total;
  return {
    detection_rate: (detection_rate * 100).toFixed(1) + '%',
    false_alarm_rate: (false_alarm_rate * 100).toFixed(1) + '%',
    avg_lead_time_h: avg_lead.toFixed(1) + ' h',
    brier_score: brier.toFixed(3),
    precision: ((detected / (detected + fa || 1)) * 100).toFixed(1) + '%',
  };
}

const radarData = [
  { metric: 'Detection', A: 75, fullMark: 100 },
  { metric: 'Lead Time', A: 68, fullMark: 100 },
  { metric: 'Precision', A: 80, fullMark: 100 },
  { metric: 'Brier (inv)', A: 85, fullMark: 100 },
  { metric: 'No False Alarm', A: 75, fullMark: 100 },
];

export default function ScorecardPanel() {
  const metrics = computeMetrics(MOCK_EVENTS);

  return (
    <div className="scorecard-panel">
      <div className="sc-header">
        <h2>📊 Post-Event Scorecard</h2>
        <p className="sc-sub">Verification of FLOWS predictions against observed outcomes</p>
      </div>

      {/* Radar + key metrics */}
      <div className="sc-top-row">
        <div className="sc-radar">
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} />
              <Radar name="FLOWS" dataKey="A" stroke="var(--flood-primary)" fill="var(--flood-primary)" fillOpacity={0.25} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="sc-key-metrics">
          {[
            ['Detection Rate', metrics.detection_rate, 'var(--confidence-high)'],
            ['False Alarm Rate', metrics.false_alarm_rate, 'var(--hazard-watch)'],
            ['Avg Lead Time', metrics.avg_lead_time_h, 'var(--flood-primary)'],
            ['Brier Score', metrics.brier_score, 'var(--compound-primary)'],
            ['Precision', metrics.precision, 'var(--confidence-high)'],
          ].map(([label, val, color]) => (
            <div key={label} className="sc-metric-box">
              <span className="sc-metric-val" style={{ color }}>{val}</span>
              <span className="sc-metric-lbl">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Events table */}
      <div className="sc-table-section">
        <div className="sc-table-title">Event Verification Log ({MOCK_EVENTS.length} events)</div>
        <table className="sc-table">
          <thead>
            <tr>
              <th>ID</th><th>Date</th><th>Site</th><th>Predicted</th><th>Actual</th>
              <th>Lead (h)</th><th>LS%</th><th>FL%</th><th>Detected?</th><th>FA?</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_EVENTS.map(e => (
              <tr key={e.id} className={e.false_alarm ? 'fa-row' : e.detected ? 'ok-row' : 'miss-row'}>
                <td className="sc-id">{e.id}</td>
                <td>{e.date}</td>
                <td>{e.site}</td>
                <td style={{ color: e.predicted_action === 'EMERGENCY' ? 'var(--hazard-critical)' : e.predicted_action === 'WARNING' ? 'var(--hazard-warning)' : 'var(--hazard-watch)', fontWeight: 600 }}>{e.predicted_action}</td>
                <td>{e.actual_outcome}</td>
                <td>{e.lead_time_h > 0 ? e.lead_time_h + ' h' : '–'}</td>
                <td>{(e.ls_prob_pred * 100).toFixed(0)}%</td>
                <td>{(e.flood_prob_pred * 100).toFixed(0)}%</td>
                <td style={{ color: e.detected ? 'var(--confidence-high)' : 'var(--hazard-critical)' }}>{e.detected ? '✓' : '✗'}</td>
                <td style={{ color: e.false_alarm ? 'var(--hazard-critical)' : 'var(--confidence-high)' }}>{e.false_alarm ? '✓' : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sc-note">
        ⓘ Scores based on {MOCK_EVENTS.length} historical events in North Sikkim pilot catchments. Full validation pending deployment to production data streams.
      </div>
    </div>
  );
}
