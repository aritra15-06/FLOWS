import React, { useEffect, useRef, useMemo } from 'react';

/**
 * Animated SVG cross-section of a river valley showing water rising.
 * valley: array of [x,y] control points (0-1 normalized)
 * waterLevel: 0-1 (fraction of valley depth)
 * arrivalHours: number
 */
function ValleyCrossSection({ waterLevel = 0, arrivalHours = null, peakDischarge = 0 }) {
  const W = 340, H = 160;
  // Valley profile: left slope, flat river bed, right slope
  const valleyPoints = [
    [0, 0], [60, 0], [90, 130], [120, 145], [170, 148], [220, 145], [250, 130], [280, 0], [340, 0]
  ];
  const pointsStr = valleyPoints.map(([x, y]) => `${x},${H - y}`).join(' ');

  // Road line at ~y=70 (above bankfull)
  const roadY = H - 80;
  // Bankfull at y=148
  const bankfullY = H - 148;
  // Water surface at waterLevel fraction between bed (H-45) and road (H-80)
  const bedY = H - 45;
  const waterY = bedY - waterLevel * (bedY - bankfullY + 60);
  const waterSubmergesRoad = waterY < roadY;

  // Generate water polygon: fill valley below water surface
  const waterPoly = useMemo(() => {
    // bottom of valley polygon points below waterY
    const pts = valleyPoints.filter(([x, y]) => (H - y) >= waterY);
    if (!pts.length) return '';
    const leftX = pts[0][0], rightX = pts[pts.length - 1][0];
    const bottom = pts.map(([x, y]) => `${x},${H - y}`).join(' ');
    return `${leftX},${waterY} ${bottom} ${rightX},${waterY}`;
  }, [waterLevel]);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Sky */}
      <rect width={W} height={H} fill="#f8fafc" />
      {/* Terrain */}
      <polygon points={pointsStr} fill="#e2e8f0" stroke="#64748b" strokeWidth="1.5" />
      {/* Water */}
      {waterLevel > 0.02 && (
        <polygon points={waterPoly} fill="rgba(2, 132, 199, 0.65)" stroke="#0284c7" strokeWidth="1.5" />
      )}
      {/* River bed (always shown) */}
      <line x1={120} y1={H - 45} x2={220} y2={H - 45} stroke="#0369a1" strokeWidth="2.5" strokeDasharray="4 2" />
      {/* Bankfull level */}
      <line x1={90} y1={bankfullY} x2={250} y2={bankfullY} stroke="#0284c7" strokeWidth="1" strokeDasharray="3 3" />
      <text x={255} y={bankfullY + 4} fill="#0369a1" fontSize={9} fontWeight="700" fontFamily="sans-serif">Bankfull</text>
      {/* Road */}
      <line x1={30} y1={roadY} x2={310} y2={roadY}
        stroke={waterSubmergesRoad ? '#dc2626' : '#d97706'} strokeWidth="3" />
      <text x={5} y={roadY + 4} fill={waterSubmergesRoad ? '#dc2626' : '#d97706'} fontSize={9} fontWeight="700" fontFamily="sans-serif">
        NH-10
      </text>
      {/* Water level label */}
      {waterLevel > 0.05 && (
        <>
          <line x1={170} y1={waterY} x2={200} y2={waterY} stroke="#0284c7" strokeWidth="1.5" />
          <text x={202} y={waterY + 4} fill="#0369a1" fontSize={9} fontWeight="700" fontFamily="sans-serif">
            {(waterLevel * 100).toFixed(0)}% flood level
          </text>
        </>
      )}
      {/* Submerged warning */}
      {waterSubmergesRoad && (
        <text x={W / 2} y={40} textAnchor="middle" fill="#dc2626" fontSize={11} fontWeight="800" fontFamily="sans-serif">
          ⚠ ROAD SUBMERGED
        </text>
      )}
      {/* Arrival countdown */}
      {arrivalHours != null && (
        <text x={W / 2} y={H - 6} textAnchor="middle" fill="#475569" fontSize={9} fontWeight="600" fontFamily="sans-serif">
          {arrivalHours < 0.5 ? 'IMMINENT' : `Flood arrival ~${arrivalHours.toFixed(1)} h`}  |  Q_peak {peakDischarge.toFixed(0)} m³/s
        </text>
      )}
    </svg>
  );
}

export default function FloodAnimation({ floodData }) {
  const animRef = useRef(null);
  const [animLevel, setAnimLevel] = React.useState(0);
  const targetLevel = floodData?.probability || 0;

  // Animate water level towards target
  useEffect(() => {
    let frame;
    const animate = () => {
      setAnimLevel(prev => {
        const diff = targetLevel - prev;
        if (Math.abs(diff) < 0.005) return targetLevel;
        return prev + diff * 0.05;
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
      />
    </div>
  );
}
