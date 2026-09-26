// 153-day monsoon crisis simulation: June 1 – October 31
import { pilotLocations } from './pilotLocations';

export const MONSOON_MONTHS = ['June', 'July', 'August', 'September', 'October'];

// Day 1 = June 1, Day 153 = October 31
export function getCalendarDate(day) {
  const startDate = new Date(2024, 5, 1); // June 1
  const d = new Date(startDate);
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getSeason(day) {
  if (day <= 15) return { name: 'Pre-Monsoon', icon: '🌤' };
  if (day <= 30) return { name: 'Monsoon Onset', icon: '🌧' };
  if (day <= 92) return { name: 'Peak Monsoon', icon: '⛈' };
  if (day <= 122) return { name: 'Active Monsoon', icon: '🌊' };
  return { name: 'Monsoon Withdrawal', icon: '🌥' };
}

// Baseline monsoon intensity by day (0-1 scale)
function monsoonIntensity(day) {
  if (day <= 10) return 0.1 + day * 0.03;
  if (day <= 30) return 0.3 + (day - 10) * 0.025;
  if (day <= 60) return 0.8 + Math.sin((day - 30) * 0.2) * 0.15;
  if (day <= 90) return 0.9 + Math.sin((day - 60) * 0.15) * 0.1;
  if (day <= 120) return 0.7 - (day - 90) * 0.01;
  return Math.max(0.1, 0.4 - (day - 120) * 0.015);
}

// Staggered crisis events per site
const CRISIS_SCHEDULE = {
  S1: [{ start: 45, peak: 50, dur: 8 }, { start: 88, peak: 92, dur: 6 }],  // Chungthang - two major events
  S2: [{ start: 60, peak: 65, dur: 7 }],                                    // Mangan
  S3: [{ start: 73, peak: 77, dur: 5 }],                                    // Dikchu
  S4: [{ start: 82, peak: 85, dur: 6 }],                                    // Singtam
  S5: [{ start: 95, peak: 98, dur: 5 }],                                    // Rangpo
  S6: [{ start: 38, peak: 42, dur: 7 }],                                    // Lachen
  S7: [{ start: 55, peak: 59, dur: 5 }],                                    // Lachung
  S8: [{ start: 70, peak: 74, dur: 4 }],                                    // Teesta Urja
};

function siteIntensity(siteId, day) {
  const events = CRISIS_SCHEDULE[siteId] || [];
  let extra = 0;
  for (const ev of events) {
    if (day >= ev.start - 5 && day <= ev.start + ev.dur + 5) {
      const dist = Math.abs(day - ev.peak);
      extra += Math.max(0, 1 - dist / 8) * 0.6;
    }
  }
  return extra;
}

export function getDailyState(day, customOverrides = {}) {
  const base = monsoonIntensity(day);
  const state = {};

  for (const loc of pilotLocations) {
    const sid = loc.id;
    const extra = siteIntensity(sid, day);
    const totalIntensity = Math.min(base + extra, 1.0);
    // Seed pseudo-random variation per site+day
    const seed = (sid.charCodeAt(1) || 1) * 7 + day;
    const noise = ((seed * 2654435761) % 1000) / 1000 * 0.15 - 0.075;
    const intensity = Math.max(0, Math.min(1, totalIntensity + noise));

    const rainfall_24h_mm = intensity * 320 + 5;
    const ls_prob = Math.min(0.99, intensity * 0.95 + (extra > 0.3 ? 0.1 : 0));
    const fl_prob = Math.min(0.99, intensity * 0.85);
    const fos = Math.max(0.3, 1.8 - intensity * 1.4);

    let action = 'ADVISORY';
    if (ls_prob > 0.8 || fl_prob > 0.8) action = 'EMERGENCY';
    else if (ls_prob > 0.6 || fl_prob > 0.6) action = 'WARNING';
    else if (ls_prob > 0.3 || fl_prob > 0.3) action = 'WATCH';

    state[sid] = {
      landslide_probability: ls_prob,
      flood_probability: fl_prob,
      compound_probability: Math.min(0.99, (ls_prob + fl_prob) / 2 * (extra > 0.2 ? 1.3 : 1)),
      factor_of_safety: fos,
      rainfall_24h_mm,
      action,
      ...(customOverrides[sid] || {}),
    };
  }
  return state;
}
