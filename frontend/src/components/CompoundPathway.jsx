import React, { useState } from 'react';

const PATHWAY_INFO = {
  RAINFALL_SLOPE_BANK: {
    icon: '⛈️ ➔ ⛰️ ➔ 🏦',
    title: 'Rainfall Saturation & Bank Slumping',
    desc: 'Intense precipitation elevates pore-water pressure, destabilizing colluvial bank toe into the river.',
    action: 'Monitor toe-scour rates; deploy geotextile and riprap armor along riverward slope base.'
  },
  LANDSLIDE_CHANNEL_BLOCK: {
    icon: '⛰️ ➔ 🚧 ➔ 🌊',
    title: 'Channel Damming & River Impoundment',
    desc: 'Rockfall or planar landslide debris dumps directly across the gorge, forming an unstable natural dam.',
    action: 'Alert downstream district magistrate; prepare breach modeling and immediate riverbank evacuation.'
  },
  BANK_UNDERCUTTING: {
    icon: '🌊 ➔ ⛰️ ➔ ⚠️',
    title: 'Hydraulic Toe-Scour & Slope Destabilization',
    desc: 'High-velocity monsoon discharge erodes basal support of hillside, inducing secondary planar sliding.',
    action: 'Enforce one-way or closed traffic on NH-10; inspect retaining structures along highway cut.'
  },
  DEBRIS_DAM_BREACH: {
    icon: '🚧 ➔ 💥 ➔ 🌊',
    title: 'Debris Dam Catastrophic Breach',
    desc: 'Impounded water overtops sediment dam, creating sudden high-discharge flash flood wave downstream.',
    action: 'Issue Level-3 RED ALERT; sounding sirens in Singtam, Rangpo, and lower Teesta river floodplains.'
  },
  UPSTREAM_FAILURE_DOWNSTREAM_FLOOD: {
    icon: '🏔️ ➔ 🌊 ➔ 🏘️',
    title: 'Cascade Displacement Surge',
    desc: 'Upper basin mass wasting displaces channel water, transferring hydrodynamic pressure to downstream bridges.',
    action: 'Inspect bridge piers (Sankalang, Dikchu, Singtam); restrict heavy vehicle transit.'
  },
  TOE_EROSION_PLANAR_SLIP: {
    icon: '🌊 ➔ ⛰️ ➔ 🚨',
    title: 'Toe-Erosion Triggered Planar Slip',
    desc: 'High hydraulic shear stresses erode bedrock toe, triggering deep-seated planar slide across NH-10.',
    action: 'Pre-position emergency clearing excavators; set up seismic vibration tripwires.'
  }
};

export default function CompoundPathway({
  pathways = [],
  summary = '',
  siteName = '',
  isOpen = false,
  onClose = () => {},
  onOpen = () => {}
}) {
  if (!pathways.length) return null;

  return (
    <>
      {/* ── SLEEK TRIGGER CHIP (Always accessible in site panel) ── */}
      <div
        className="compound-trigger-card"
        onClick={onOpen}
        title="Click to view detailed Cascade Coupling Modal"
        style={{
          margin: '10px 0 6px 0',
          padding: '8px 12px',
          background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
          border: '1px solid #d8b4fe',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(147, 51, 234, 0.12)',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.05rem', animation: 'pulse 1.8s infinite' }}>⚡</span>
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#6b21a8', letterSpacing: '0.3px' }}>
              COUPLING ACTIVE ({pathways.length} Cascade{pathways.length > 1 ? 's' : ''})
            </div>
            <div style={{ fontSize: '0.68rem', color: '#7e22ce', opacity: 0.9 }}>
              Multi-hazard geotechnical & flood interaction active
            </div>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          style={{
            background: '#7e22ce',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(126, 34, 206, 0.3)'
          }}
        >
          View Alert ↗
        </button>
      </div>

      {/* ── POP-UP MODAL MENU DIALOG ── */}
      {isOpen && (
        <div
          className="compound-modal-backdrop"
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 16,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            className="compound-modal-window"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(216, 180, 254, 0.5)',
              border: '2px solid #a855f7',
              display: 'flex',
              flexDirection: 'column',
              animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #581c87 0%, #7e22ce 100%)',
                color: '#ffffff',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.6))' }}>⚡</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, letterSpacing: '0.4px' }}>
                    CASCADE COUPLING ALERT
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#e9d5ff', marginTop: 1 }}>
                    {siteName ? `Affected Location: ${siteName}` : 'Compound Geotechnical & Hydraulic Crisis'}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#ffffff',
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Alert Status Pill */}
              <div
                style={{
                  padding: '10px 14px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>🚨</span>
                <div style={{ fontSize: '0.78rem', color: '#991b1b', lineHeight: 1.4 }}>
                  <strong>Compound Interaction in Effect:</strong> Individual hazards (slope instability and river stage surge) have physically coupled, escalating downstream vulnerability beyond independent thresholds.
                </div>
              </div>

              {/* Cascade Pathways List */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                  Active Cascade Chain ({pathways.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pathways.map((p, i) => {
                    const info = PATHWAY_INFO[p] || {
                      icon: '⚡ ➔ ⚠️',
                      title: p.replace(/_/g, ' '),
                      desc: 'Coupled hydrodynamic and slope failure interaction.',
                      action: 'Coordinate with multi-agency responders.'
                    };
                    return (
                      <div
                        key={p || i}
                        style={{
                          padding: '12px 14px',
                          background: '#fdf4ff',
                          border: '1px solid #f0abfc',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#86198f' }}>
                            {info.title}
                          </span>
                          <span style={{ fontSize: '0.8rem', background: '#fae8ff', padding: '2px 8px', borderRadius: 4, color: '#701a75', fontWeight: 700 }}>
                            {info.icon}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#4a044e', lineHeight: 1.45, marginBottom: 6 }}>
                          {info.desc}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#0369a1', background: '#f0f9ff', padding: '6px 10px', borderRadius: 6, border: '1px solid #bae6fd' }}>
                          <strong>Recommended Protocol:</strong> {info.action}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Physical Summary Box */}
              {summary && (
                <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: 4 }}>
                    Geotechnical & Hydrological Analysis Summary
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#475569', lineHeight: 1.5 }}>
                    {summary}
                  </div>
                </div>
              )}

              {/* SOP Action Checklist */}
              <div style={{ padding: '12px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#166534', marginBottom: 6 }}>
                  Emergency SOP Counter-Measures (SDRF & GSI Protocol)
                </div>
                <div style={{ fontSize: '0.72rem', color: '#15803d', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>✓ Sound early warning siren network across Teesta riverside communities</div>
                  <div>✓ Halt civilian transit along susceptible highway cuts (NH-10 / SH-1 / SH-2)</div>
                  <div>✓ Dispatch reconnaissance drone team to inspect toe erosion & channel impoundment</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                onClick={onClose}
                style={{
                  padding: '7px 16px',
                  background: '#7e22ce',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(126, 34, 206, 0.35)',
                }}
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
