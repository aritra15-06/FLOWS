import { BBOX, sampleSatelliteElevation } from "./river3DBuilder";

/**
 * Computes localized geotechnical and hydrological telemetry for ANY coordinate in Sikkim.
 * Evaluates real satellite DEM elevation, slope gradient, river drainage proximity,
 * and spatially interpolated meteorological pressure from monitored stations.
 */
export function calculatePointSeverity(
  lat,
  lng,
  sites = {},
  satelliteData = {},
  liveWaterways = [],
  hazardMode = "compound"
) {
  const elevations = satelliteData?.elevations || [];
  const gridSize = satelliteData?.grid_size || 25;
  const minElev = satelliteData?.min_elevation || 262;
  const maxElev = satelliteData?.max_elevation || 5473;

  const normX = Math.max(0, Math.min(1, (lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)));
  const normZ = Math.max(0, Math.min(1, (BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)));

  // 1. Satellite Elevation & Local Slope
  const { hMeters } = sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev);
  const delta = 0.015;
  const hX = sampleSatelliteElevation(Math.min(1, normX + delta), normZ, elevations, gridSize, minElev, maxElev).hMeters;
  const hZ = sampleSatelliteElevation(normX, Math.min(1, normZ + delta), elevations, gridSize, minElev, maxElev).hMeters;
  const dxMeters = delta * 50000;
  const dzMeters = delta * 72000;
  const grad = Math.hypot((hX - hMeters) / dxMeters, (hZ - hMeters) / dzMeters);
  const slopeDeg = Math.max(5, Math.min(54, Math.round(((Math.atan(grad) * 180) / Math.PI) * 3.8)));

  // 2. Minimum Distance to Monitored Waterways (in km)
  let minDistToRiverKm = 99.0;
  if (liveWaterways && liveWaterways.length > 0) {
    for (let i = 0; i < liveWaterways.length; i++) {
      const rw = liveWaterways[i];
      const pts = rw.points || [];
      for (let j = 0; j < pts.length; j += 2) {
        const dLat = (lat - pts[j][0]) * 111.32;
        const dLng = (lng - pts[j][1]) * 111.32 * Math.cos((lat * Math.PI) / 180);
        const d = Math.hypot(dLat, dLng);
        if (d < minDistToRiverKm) minDistToRiverKm = d;
      }
    }
  }

  // 3. Spatially Interpolate Weather & Hazard from Monitored Stations (Core + Custom)
  let totalW = 0.0001;
  let sumRain1h = 0;
  let sumRain24h = 0;
  let sumSiteSeverity = 0;
  let nearestSite = null;
  let minSiteDistKm = 999;

  Object.values(sites).forEach((s) => {
    const sLat = Number(s?.latitude ?? s?.lat ?? s?.current_params?.latitude);
    const sLng = Number(s?.longitude ?? s?.lon ?? s?.lng ?? s?.current_params?.longitude);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) return;

    const dLat = (lat - sLat) * 111.32;
    const dLng = (lng - sLng) * 111.32 * Math.cos((lat * Math.PI) / 180);
    const distKm = Math.hypot(dLat, dLng);
    if (distKm < minSiteDistKm) {
      minSiteDistKm = distKm;
      nearestSite = s;
    }

    const w = 1.0 / (Math.pow(distKm, 1.8) + 4.0);
    totalW += w;
    const r1 = s.rainfall_1h_mm ?? s.current_params?.rainfall_1h_mm ?? 1.5;
    const r24 = s.rainfall_24h_mm ?? s.current_params?.rainfall_24h_mm ?? 20;
    sumRain1h += r1 * w;
    sumRain24h += r24 * w;

    let sSev = 0.15;
    const isUnstable = s.stability_state === "UNSTABLE" || s.river_stage_state === "CATASTROPHIC_SURGE" || (s.factor_of_safety != null && s.factor_of_safety < 1.0);
    const isMarginal = s.stability_state === "MARGINAL" || s.river_stage_state === "OVERBANK_FLOODING" || (s.factor_of_safety != null && s.factor_of_safety < 1.3);
    if (isUnstable) sSev = 0.95;
    else if (isMarginal) sSev = 0.65;
    else if (s.river_stage_state === "BANKFULL_WARNING") sSev = 0.45;
    else sSev = Math.max(0.12, (s.probability_percent || 15) / 100);
    sumSiteSeverity += sSev * w;
  });

  const interpRain1h = sumRain1h / totalW;
  const interpRain24h = sumRain24h / totalW;
  const interpSiteSev = sumSiteSeverity / totalW;

  // 4. Physical Geotechnical Model (Factor of Safety & Landslide Probability)
  const baseFos = 1.95 - (slopeDeg / 45.0) * 0.95;
  const currentFos = Math.max(0.68, Math.min(2.2, baseFos - (interpRain24h / 140.0) * 0.75));
  let lsProb = 10;
  if (currentFos < 1.0) lsProb = Math.min(98, Math.round(78 + (1.0 - currentFos) * 65));
  else if (currentFos < 1.3) lsProb = Math.round(48 + (1.3 - currentFos) * 100);
  else if (currentFos < 1.5) lsProb = Math.round(22 + (1.5 - currentFos) * 120);
  else lsProb = Math.max(5, Math.round(20 - (currentFos - 1.5) * 20));

  // 5. Physical Hydrological Model (River Conveyance & Flood Surge)
  const isNearRiver = minDistToRiverKm <= 1.8;
  let flProb = 5;
  let riverStage = "NORMAL";
  if (isNearRiver) {
    const runoffAccumulation = (interpRain24h / 100.0) * Math.max(0, 1.0 - minDistToRiverKm / 1.8);
    flProb = Math.min(98, Math.max(8, Math.round(runoffAccumulation * 95)));
    if (flProb >= 72) riverStage = "OVERBANK_FLOODING";
    else if (flProb >= 42) riverStage = "BANKFULL_WARNING";
  }

  // 6. Compound Hazard Synthesis
  let compoundScore = 0;
  if (hazardMode === "landslide") {
    compoundScore = lsProb / 100.0;
  } else if (hazardMode === "flood") {
    compoundScore = flProb / 100.0;
  } else {
    // True compound disaster maximum
    compoundScore = Math.max(lsProb / 100.0, flProb / 100.0);
  }

  // Blend with local storm pressure from surrounding stations
  compoundScore = Math.max(compoundScore, interpSiteSev * 0.85);

  if (minSiteDistKm < 10.0) {
    const alpha = Math.exp(-Math.pow(minSiteDistKm / 5.0, 2));
    compoundScore = compoundScore * (1 - alpha) + interpSiteSev * alpha;
  }

  let stabilityState = "STABLE";
  let severityBand = "MINOR";
  let color = "#16a34a";
  let badgeText = "🟢 NOMINAL STABILITY: LOW HAZARD";

  if (compoundScore >= 0.70 || currentFos < 1.0 || riverStage === "OVERBANK_FLOODING" || riverStage === "CATASTROPHIC_SURGE") {
    stabilityState = "UNSTABLE";
    severityBand = "CATASTROPHIC_POTENTIAL";
    color = "#dc2626";
    badgeText = "🚨 CRITICAL SEVERITY: FAILURE IMMINENT";
  } else if (compoundScore >= 0.48 || currentFos < 1.25 || riverStage === "BANKFULL_WARNING") {
    stabilityState = "MARGINAL";
    severityBand = "MAJOR";
    color = "#ea580c";
    badgeText = "⚠️ MAJOR WARNING: DEGRADED STABILITY";
  } else if (compoundScore >= 0.32 || lsProb >= 35 || (currentFos < 1.35 && interpRain24h >= 40)) {
    stabilityState = "ADVISORY";
    severityBand = "MODERATE";
    color = "#eab308";
    badgeText = "⚡ MODERATE ADVISORY: MONITORING";
  } else {
    stabilityState = "STABLE";
    severityBand = "MINOR";
    color = "#16a34a";
    badgeText = "🟢 NOMINAL STABILITY: LOW HAZARD";
  }

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    elevation_m: Math.round(hMeters),
    slope_deg: slopeDeg,
    minDistToRiverKm: Number(minDistToRiverKm.toFixed(2)),
    rainfall_1h_mm: Number(interpRain1h.toFixed(1)),
    rainfall_24h_mm: Math.round(interpRain24h),
    factor_of_safety: Number(currentFos.toFixed(2)),
    landslide_probability_percent: lsProb,
    flood_probability_percent: flProb,
    compound_score: Number(compoundScore.toFixed(2)),
    stability_state: stabilityState,
    river_stage_state: riverStage,
    severity_band: severityBand,
    color,
    badgeText,
    nearestSiteName: nearestSite?.name || "Regional Teesta Basin",
    distToNearestSiteKm: Number(minSiteDistKm.toFixed(2)),
  };
}

/**
 * Renders a physically grounded, highly responsive continuous thermal hazard heatmap across Sikkim.
 * Computes localized slope failure and river inundation risks for all coordinates,
 * dynamically incorporating active monitored stations and custom dropped pointers.
 */
export function renderDynamicHazardHeatmap(
  canvas,
  sites = {},
  satelliteData = {},
  liveWaterways = [],
  hazardMode = "compound"
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const elevations = satelliteData?.elevations || [];
  const gridSize = satelliteData?.grid_size || 25;
  const minElev = satelliteData?.min_elevation || 262;
  const maxElev = satelliteData?.max_elevation || 5473;

  // 1. Compile station coordinates & calibrated severities
  const stationList = [];
  Object.values(sites).forEach((s) => {
    const lat = Number(s?.latitude ?? s?.lat ?? s?.current_params?.latitude);
    const lng = Number(s?.longitude ?? s?.lon ?? s?.lng ?? s?.current_params?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const nx = Math.max(0, Math.min(1, (lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)));
    const nz = Math.max(0, Math.min(1, (BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat)));
    const r24 = s.rainfall_24h_mm ?? s.current_params?.rainfall_24h_mm ?? 15;
    const isUnstable =
      s.stability_state === "UNSTABLE" ||
      s.river_stage_state === "CATASTROPHIC_SURGE" ||
      (s.factor_of_safety != null && s.factor_of_safety < 1.0);
    const isMarginal =
      s.stability_state === "MARGINAL" ||
      s.river_stage_state === "OVERBANK_FLOODING" ||
      (s.factor_of_safety != null && s.factor_of_safety < 1.3);

    let sScore = 0.15;
    if (isUnstable) sScore = 0.95;
    else if (isMarginal) sScore = 0.65;
    else if (s.river_stage_state === "BANKFULL_WARNING") sScore = 0.45;
    else sScore = Math.max(0.12, (s.probability_percent || 15) / 100);

    stationList.push({ nx, nz, r24, sScore });
  });

  // Fallback if no sites available
  if (stationList.length === 0) {
    stationList.push({ nx: 0.5, nz: 0.5, r24: 15, sScore: 0.15 });
  }

  // 2. Subsample river points for fast channel distance evaluation
  const riverNodes = [];
  if (liveWaterways) {
    liveWaterways.forEach((rw) => {
      const pts = rw.points || [];
      const step = Math.max(6, Math.floor(pts.length / 25));
      for (let p = 0; p < pts.length; p += step) {
        const rLat = pts[p][0];
        const rLng = pts[p][1];
        const rnx = (rLng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng);
        const rnz = (BBOX.maxLat - rLat) / (BBOX.maxLat - BBOX.minLat);
        riverNodes.push({ nx: rnx, nz: rnz });
      }
    });
  }

  // 3. Render continuous pixel raster across the entire terrain
  for (let y = 0; y < height; y++) {
    const nz = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const nx = x / (width - 1);
      const pixelIndex = (y * width + x) * 4;

      // DEM sample & local slope
      const { hMeters } = sampleSatelliteElevation(nx, nz, elevations, gridSize, minElev, maxElev);
      const hX = sampleSatelliteElevation(Math.min(1, nx + 0.02), nz, elevations, gridSize, minElev, maxElev).hMeters;
      const hZ = sampleSatelliteElevation(nx, Math.min(1, nz + 0.02), elevations, gridSize, minElev, maxElev).hMeters;
      const slopeGrad = Math.hypot((hX - hMeters) / 1000, (hZ - hMeters) / 1440);
      const slopeDeg = Math.max(5, Math.min(54, ((Math.atan(slopeGrad) * 180) / Math.PI) * 3.2));

      // Station IDW weather & calibrated score with realistic regional spatial radius
      let wSum = 0.0001;
      let rainSum = 0;
      let scoreSum = 0;
      let minStationDistSq = 999;
      for (let s = 0; s < stationList.length; s++) {
        const st = stationList[s];
        const dx = nx - st.nx;
        const dz = nz - st.nz;
        const dSq = dx * dx + dz * dz;
        if (dSq < minStationDistSq) minStationDistSq = dSq;
        // Inverse distance weighting with realistic valley scale (0.15 ~ 8km)
        const w = 1.0 / (dSq + 0.035);
        wSum += w;
        rainSum += st.r24 * w;
        scoreSum += st.sScore * w;
      }
      const minStationDist = Math.sqrt(minStationDistSq);
      const localRain = rainSum / wSum;
      const localStationScore = scoreSum / wSum;

      // River distance (squared distance optimization)
      let minRiverDistSq = 999;
      for (let r = 0; r < riverNodes.length; r++) {
        const rn = riverNodes[r];
        const dx = nx - rn.nx;
        const dz = nz - rn.nz;
        const dSq = dx * dx + dz * dz;
        if (dSq < minRiverDistSq) {
          minRiverDistSq = dSq;
          if (dSq < 0.0001) break;
        }
      }
      const minRiverDist = Math.sqrt(minRiverDistSq);

      // Topographic Vulnerabilities
      const slopeFactor = Math.max(0.12, Math.min(1.0, (slopeDeg - 10) / 26));
      const rainFactor = Math.max(0.15, Math.min(1.3, localRain / 85));
      const lsHazard = localStationScore * (0.35 + 0.65 * slopeFactor) * rainFactor;

      const riverFactor = Math.max(0, 1.0 - minRiverDist / 0.04);
      const valleyFactor = Math.max(0, 1.0 - (hMeters - minElev) / 2900);
      const flHazard = localStationScore * (0.3 + 0.7 * (riverFactor * valleyFactor)) * Math.max(0.2, Math.min(1.3, localRain / 70));

      let H = 0;
      if (hazardMode === "landslide") H = lsHazard;
      else if (hazardMode === "flood") H = flHazard;
      else H = Math.max(lsHazard, flHazard);

      // Smooth direct calibration within immediate vicinity of a station
      if (minStationDist < 0.16) {
        const alpha = Math.exp(-Math.pow(minStationDist / 0.08, 2));
        H = H * (1 - alpha) + localStationScore * alpha;
      }
      H = Math.max(0.04, Math.min(0.98, H));

      // Luminous 4-color thermal palette
      let red = 22;
      let green = 163;
      let blue = 74;

      if (H < 0.28) {
        // Lush Forest Green (#16a34a -> #22c55e)
        const t = H / 0.28;
        red = Math.round(22 + (34 - 22) * t);
        green = Math.round(163 + (197 - 163) * t);
        blue = Math.round(74 + (94 - 74) * t);
      } else if (H < 0.52) {
        // Bright Amber-Yellow (#eab308 -> #f59e0b)
        const t = (H - 0.28) / 0.24;
        red = Math.round(34 + (234 - 34) * t);
        green = Math.round(197 + (179 - 197) * t);
        blue = Math.round(94 + (8 - 94) * t);
      } else if (H < 0.74) {
        // Warning Orange (#f97316 -> #ea580c)
        const t = (H - 0.52) / 0.22;
        red = Math.round(234 + (249 - 234) * t);
        green = Math.round(179 + (115 - 179) * t);
        blue = Math.round(8 + (22 - 8) * t);
      } else {
        // Critical Crimson Red (#dc2626 -> #991b1b)
        const t = (H - 0.74) / 0.26;
        red = Math.round(249 + (220 - 249) * t);
        green = Math.round(115 + (38 - 115) * t);
        blue = Math.round(22 + (38 - 22) * t);
      }

      data[pixelIndex] = red;
      data[pixelIndex + 1] = green;
      data[pixelIndex + 2] = blue;
      data[pixelIndex + 3] = 238; // 93% opacity for vibrant color
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
