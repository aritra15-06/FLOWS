import React, { useEffect, useState, useMemo } from 'react';

/**
 * Animated SVG cross-section of a Himalayan V-gorge river valley.
 * Shows parametric water level rising, bankfull overflow, and NH-10 road bench submersion.
 */
function ValleyCrossSection({ waterLevel = 0.15, arrivalHours = null, peakDischarge = 0, depthMeters = null }) {
  const W = 340;
  const H = 165;
  const [wavePhase, setWavePhase] = useState(0);

  // Animate surface ripple
  useEffect(() => {
    let animId;
    const tick = () => {
      setWavePhase((prev) => (prev + 0.08) % (Math.PI * 2));
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Natural Himalayan V-gorge profile
  // Left wall, riverbed, right wall
  // (0, 22) -> (50, 45) -> (100, 95) -> (130, 125) -> bed (170, 142) -> (210, 125) -> (240, 95) -> (290, 45) -> (340, 22)
  const bedY = 142;
  const bankfullY = 105;
  const roadY = 82; // Highway bench level
  const minWaterY = 48; // Max catastrophic flood height

  // Normalized water level: clamped 0.08 (nominal dry stream) to 1.0 (peak catastrophic flood)
  const normLevel = Math.max(0.08, Math.min(1.0, waterLevel));
  const waterY = bedY - normLevel * (bedY - minWaterY);
  const isBankfull = waterY <= bankfullY;
  const isRoadSubmerged = waterY <= roadY;

  // Compute exact water polygon boundary intersecting valley walls
  const { waterPolyStr, wavePathStr, leftX, rightX } = useMemo(() => {
    // Left slope function
    const getLeftX = (y) => {
      if (y >= 125) return 130 + ((y - 125) / (bedY - 125)) * (170 - 130);
      if (y >= 95) return 100 + ((y - 95) / 30) * 30;
      if (y >= 45) return 50 + ((y - 45) / 50) * 50;
      return ((y - 22) / 23) * 50;
    };

    // Right slope function
    const getRightX = (y) => {
      if (y >= 125) return 210 - ((y - 125) / (bedY - 125)) * (210 - 170);
      if (y >= 95) return 240 - ((y - 95) / 30) * 30;
      if (y >= 45) return 290 - ((y - 45) / 50) * 50;
      return 340 - ((y - 22) / 23) * 50;
    };

    const lX = Math.max(10, Math.min(160, getLeftX(waterY)));
    const rX = Math.min(330, Math.max(180, getRightX(waterY)));

    // Intermediate bed points submerged below waterY
    const subPoints = [];
    if (waterY < 125) subPoints.push([130, 125]);
    if (waterY < 136) subPoints.push([150, 137]);
    subPoints.push([170, 142]);
    if (waterY < 136) subPoints.push([190, 137]);
    if (waterY < 125) subPoints.push([210, 125]);

    const bedStr = subPoints.map(([x, y]) => `${x.toFixed(1)},${y}`).join(' ');
    const polyStr = `${lX.toFixed(1)},${waterY.toFixed(1)} ${bedStr} ${rX.toFixed(1)},${waterY.toFixed(1)}`;

    // Animated water surface ripple
    const midX = (lX + rX) / 2;
    const waveAmp = isBankfull ? 2.5 : 1.2;
    const waveY1 = waterY + Math.sin(wavePhase) * waveAmp;
    const waveY2 = waterY + Math.cos(wavePhase) * waveAmp;
    const wavePath = `M ${lX.toFixed(1)} ${waterY.toFixed(1)} Q ${midX.toFixed(1)} ${waveY1.toFixed(1)} ${rX.toFixed(1)} ${waterY.toFixed(1)}`;

    return { waterPolyStr: polyStr, wavePathStr: wavePath, leftX: lX, rightX: rX };
  }, [waterY, wavePhase, isBankfull]);

  // Dynamic flood water color palette
  const waterFill = isRoadSubmerged
    ? 'rgba(220, 38, 38, 0.72)' // Catastrophic red surge
    : isBankfull
    ? 'rgba(217, 119, 6, 0.68)' // Bankfull amber turbid surge
    : 'rgba(2, 132, 199, 0.65)'; // Clear mountain river blue

  const waterStroke = isRoadSubmerged ? '#b91c1c' : isBankfull ? '#d97706' : '#0284c7';

  // Valley terrain polygon
  const terrainPoints = '0,22 50,45 100,95 130,125 150,137 170,142 190,137 210,125 240,95 290,45 340,22 340,165 0,165';

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', borderRadius: 8, background: '#f8fafc' }}>
      {/* Sky Gradient */}
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="rockGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#skyGrad)" />

      {/* Mountain Gorge Walls */}
      <polygon points={terrainPoints} fill="url(#rockGrad)" stroke="#64748b" strokeWidth="1.5" />

      {/* Dynamic Water Volume */}
      <polygon points={waterPolyStr} fill={waterFill} stroke={waterStroke} strokeWidth="1.5" />
      <path d={wavePathStr} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.8" />

      {/* Natural Riverbed Baseline */}
      <line x1={150} y1={bedY} x2={190} y2={bedY} stroke="#0369a1" strokeWidth="2.5" strokeDasharray="3 2" />
      <text x={170} y={bedY + 12} textAnchor="middle" fill="#475569" fontSize={8} fontWeight="700">
        River Channel Bed
      </text>

      {/* Bankfull Warning Datum */}
      <line x1={95} y1={bankfullY} x2={245} y2={bankfullY} stroke={isBankfull ? '#dc2626' : '#0284c7'} strokeWidth="1.2" strokeDasharray="4 3" />
      <text x={248} y={bankfullY + 3} fill={isBankfull ? '#dc2626' : '#0369a1'} fontSize={8} fontWeight="700">
        Bankfull (120 m³/s)
      </text>

      {/* NH-10 Highway Bench Cut on Hillside */}
      <line x1={32} y1={roadY} x2={78} y2={roadY} stroke={isRoadSubmerged ? '#dc2626' : '#d97706'} strokeWidth="4" strokeLinecap="round" />
      <rect x={35} y={roadY - 14} width={38} height={12} rx={3} fill={isRoadSubmerged ? '#fee2e2' : '#fef3c7'} stroke={isRoadSubmerged ? '#ef4444' : '#f59e0b'} strokeWidth="1" />
      <text x={54} y={roadY - 5} textAnchor="middle" fill={isRoadSubmerged ? '#b91c1c' : '#b45309'} fontSize={7.5} fontWeight="800">
        NH-10
      </text>

      {/* Submerged Road Critical Banner */}
      {isRoadSubmerged && (
        <g>
          <rect x={W / 2 - 80} y={18} width={160} height={18} rx={4} fill="#dc2626" opacity="0.95" />
          <text x={W / 2} y={30} textAnchor="middle" fill="#ffffff" fontSize={9} fontWeight="800">
            🚨 NH-10 ROADWAY INUNDATED
          </text>
        </g>
      )}

      {/* Live Stage Depth Gauge Banner */}
      <g transform={`translate(${rightX + 4}, ${Math.max(38, Math.min(135, waterY))})`}>
        <rect x={0} y={-9} width={62} height={16} rx={3} fill="#ffffff" stroke={waterStroke} strokeWidth="1.2" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.1))" />
        <text x={31} y={2} textAnchor="middle" fill={waterStroke} fontSize={8} fontWeight="800">
          {depthMeters ? `${depthMeters.toFixed(1)}m Depth` : `${Math.round(normLevel * 100)}% Stage`}
        </text>
      </g>

      {/* Footer Telemetry Strip */}
      <text x={W / 2} y={H - 5} textAnchor="middle" fill="#334155" fontSize={8.5} fontWeight="700">
        {arrivalHours != null && arrivalHours < 1.0 ? '🚨 INUNDATION IMMINENT' : `Arrival: ~${(arrivalHours || 2.5).toFixed(1)}h`}
        {' · '}
        Peak Flow: {Math.round(peakDischarge)} m³/s
        {depthMeters != null ? ` · Water Rise: +${depthMeters.toFixed(2)}m` : ''}
      </text>
    </svg>
  );
}

export default function FloodAnimation({ floodData }) {
  const [animLevel, setAnimLevel] = useState(0.15);

  // Compute realistic target water stage from flood probability and inundation depth
  const prob = floodData?.probability ?? floodData?.flood_probability_percent != null ? floodData.flood_probability_percent / 100 : 0.15;
  const depth = Number(floodData?.inundation_depth_m || 0);

  // Target level: 0.12 baseline dry flow, scaling up to 1.0 for severe flood
  const targetLevel = depth > 0
    ? Math.max(0.12, Math.min(1.0, 0.12 + (depth / 3.2) * 0.88))
    : Math.max(0.12, Math.min(1.0, 0.12 + prob * 0.88));

  // Smooth fluid animation loop
  useEffect(() => {
    let frame;
    const animate = () => {
      setAnimLevel((prev) => {
        const diff = targetLevel - prev;
        if (Math.abs(diff) < 0.003) return targetLevel;
        return prev + diff * 0.08;
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [targetLevel]);

  return (
    <div className="flood-anim-wrapper">
      <ValleyCrossSection
        waterLevel={animLevel}
        arrivalHours={floodData?.arrival_time_hours}
        peakDischarge={floodData?.peak_discharge_m3s || 0}
        depthMeters={depth > 0 ? depth : null}
      />
    </div>
  );
}
