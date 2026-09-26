import React from 'react';

const PATHWAY_INFO = {
  RAINFALL_SLOPE_BANK: { icon: '⛈→⛰→🏦', desc: 'Extreme rainfall saturates slope → bank failure' },
  LANDSLIDE_CHANNEL_BLOCK: { icon: '⛰→🚧', desc: 'Landslide runout blocks river channel' },
  BANK_UNDERCUTTING: { icon: '🌊→⛰', desc: 'River flood erodes toe → slope destabilized' },
  DEBRIS_DAM_BREACH: { icon: '🚧→💥', desc: 'Debris dam impoundment → sudden breach surge' },
  UPSTREAM_FAILURE_DOWNSTREAM_FLOOD: { icon: '⛰→🌊', desc: 'Upstream mass failure sends displacement wave' },
};

export default function CompoundPathway({ pathways = [], summary }) {
  if (!pathways.length) return null;

  return (
    <div className="compound-panel">
      <div className="compound-header">
        <span className="compound-badge">⚡ COMPOUND COUPLING ACTIVE</span>
        <span className="compound-count">{pathways.length} pathway{pathways.length > 1 ? 's' : ''}</span>
      </div>

      <div className="pathway-list">
        {pathways.map((p, i) => {
          const info = PATHWAY_INFO[p] || { icon: '⚡', desc: p.replace(/_/g, ' ') };
          return (
            <div key={p} className="pathway-item">
              <span className="pathway-icon">{info.icon}</span>
              <div className="pathway-info">
                <span className="pathway-code">{p.replace(/_/g, ' ')}</span>
                <span className="pathway-desc">{info.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {summary && <div className="compound-summary">{summary}</div>}
    </div>
  );
}
