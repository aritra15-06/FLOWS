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

    const w = 1.0 / Math.pow(distKm + 2.5, 2.0);
    totalW += w;
    const r1 = s.rainfall_1h_mm ?? s.current_params?.rainfall_1h_mm ?? 1.5;
    const r24 = s.rainfall_24h_mm ?? s.current_params?.rainfall_24h_mm ?? 20;
    sumRain1h += r1 * w;
    sumRain24h += r24 * w;

    let sSev = 0.15;
    if (s.stability_state === "UNSTABLE" || s.river_stage_state === "CATASTROPHIC_SURGE") sSev = 0.92;
    else if (s.stability_state === "MARGINAL" || s.river_stage_state === "OVERBANK_FLOODING") sSev = 0.65;
    else if (s.river_stage_state === "BANKFULL_WARNING") sSev = 0.45;
    sumSiteSeverity += sSev * w;
  });

  const interpRain1h = sumRain1h / totalW;
  const interpRain24h = sumRain24h / totalW;
  const interpSiteSev = sumSiteSeverity / totalW;

  // 4. Physical Geotechnical Model (Factor of Safety & Landslide Probability)
  const baseFos = 1.95 - (slopeDeg / 45.0) * 0.95;
  const currentFos = Math.max(0.7, Math.min(2.2, baseFos - (interpRain24h / 150.0) * 0.7));
  let lsProb = 10;
  if (currentFos < 1.0) lsProb = Math.min(98, Math.round(75 + (1.0 - currentFos) * 65));
  else if (currentFos < 1.3) lsProb = Math.round(45 + (1.3 - currentFos) * 100);
  else if (currentFos < 1.5) lsProb = Math.round(20 + (1.5 - currentFos) * 125);
  else lsProb = Math.max(5, Math.round(20 - (currentFos - 1.5) * 20));

  // 5. Physical Hydrological Model (River Conveyance & Flood Surge)
  const isNearRiver = minDistToRiverKm <= 1.5;
  let flProb = 5;
  let riverStage = "NORMAL";
  if (isNearRiver) {
    const runoffAccumulation = (interpRain24h / 110.0) * Math.max(0, 1.0 - minDistToRiverKm / 1.5);
    flProb = Math.min(96, Math.max(8, Math.round(runoffAccumulation * 92)));
    if (flProb >= 75) riverStage = "OVERBANK_FLOODING";
    else if (flProb >= 45) riverStage = "BANKFULL_WARNING";
  }

  // 6. Compound Hazard Synthesis
  let compoundScore = 0;
  if (hazardMode === "landslide") {
    compoundScore = lsProb / 100.0;
  } else if (hazardMode === "flood") {
    compoundScore = flProb / 100.0;
  } else {
    compoundScore = (Math.max(lsProb, flProb) / 100.0) * 0.72 + (Math.min(lsProb, flProb) / 100.0) * 0.28;
  }

  if (minSiteDistKm < 3.5) {
    const alpha = Math.exp(-Math.pow(minSiteDistKm / 2.0, 2));
    compoundScore = compoundScore * (1 - alpha) + interpSiteSev * alpha;
  }

  let stabilityState = "STABLE";
  let severityBand = "MINOR";
  let color = "#16a34a";
  let badgeText = "🟢 NOMINAL STABILITY: LOW HAZARD";

  if (compoundScore >= 0.72 || currentFos < 1.0 || riverStage === "OVERBANK_FLOODING") {
    stabilityState = "UNSTABLE";
    severityBand = "CATASTROPHIC_POTENTIAL";
    color = "#dc2626";
    badgeText = "🚨 CRITICAL SEVERITY: FAILURE IMMINENT";
  } else if (compoundScore >= 0.48 || currentFos < 1.3 || riverStage === "BANKFULL_WARNING") {
    stabilityState = "MARGINAL";
    severityBand = "MAJOR";
    color = "#ea580c";
    badgeText = "⚠️ MAJOR WARNING: ELEVATED THREAT";
  } else if (compoundScore >= 0.26 || currentFos < 1.5) {
    stabilityState = "MARGINAL";
    severityBand = "MODERATE";
    color = "#eab308";
    badgeText = "⚡ MODERATE ADVISORY: MONITORING";
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
 * Renders a physically grounded, continuous thermal hazard heatmap across Sikkim.
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
    const r24 = s.rainfall_24h_mm ?? s.current_params?.rainfall_24h_mm ?? 20;
    const isUnstable = s.stability_state === "UNSTABLE" || s.river_stage_state === "CATASTROPHIC_SURGE";
    const isMarginal = s.stability_state === "MARGINAL" || s.river_stage_state === "OVERBANK_FLOODING";
    const sScore = isUnstable ? 0.92 : isMarginal ? 0.62 : s.river_stage_state === "BANKFULL_WARNING" ? 0.44 : 0.16;
    stationList.push({ nx, nz, r24, sScore });
  });

  // 2. Subsample river points for fast channel distance evaluation
  const riverNodes = [];
  if (liveWaterways) {
    liveWaterways.forEach((rw) => {
      const pts = rw.points || [];
      for (let p = 0; p < pts.length; p += 3) {
        const rLat = pts[p][0];
        const rLng = pts[p][1];
        const rnx = (rLng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng);
        const rnz = (BBOX.maxLat - rLat) / (BBOX.maxLat - BBOX.minLat);
        riverNodes.push({ nx: rnx, nz: rnz });
      }
    });
  }

  // 3. Render continuous pixel raster
  for (let y = 0; y < height; y++) {
    const nz = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const nx = x / (width - 1);
      const pixelIndex = (y * width + x) * 4;

      // DEM sample & slope
      const { hMeters } = sampleSatelliteElevation(nx, nz, elevations, gridSize, minElev, maxElev);
      const hX = sampleSatelliteElevation(Math.min(1, nx + 0.02), nz, elevations, gridSize, minElev, maxElev).hMeters;
      const hZ = sampleSatelliteElevation(nx, Math.min(1, nz + 0.02), elevations, gridSize, minElev, maxElev).hMeters;
      const slopeGrad = Math.hypot((hX - hMeters) / 1000, (hZ - hMeters) / 1440);
      const slopeDeg = Math.max(5, Math.min(54, ((Math.atan(slopeGrad) * 180) / Math.PI) * 3.8));

      // Station IDW weather & calibrated score
      let wSum = 0.0001;
      let rainSum = 0;
      let scoreSum = 0;
      let minStationDist = 999;
      for (let s = 0; s < stationList.length; s++) {
        const st = stationList[s];
        const d = Math.hypot(nx - st.nx, nz - st.nz);
        if (d < minStationDist) minStationDist = d;
        const w = 1.0 / ((d + 0.08) * (d + 0.08));
        wSum += w;
        rainSum += st.r24 * w;
        scoreSum += st.sScore * w;
      }
      const localRain = rainSum / wSum;
      const localStationScore = scoreSum / wSum;

      // River distance
      let minRiverDist = 999;
      for (let r = 0; r < riverNodes.length; r++) {
        const rn = riverNodes[r];
        const d = Math.hypot(nx - rn.nx, nz - rn.nz);
        if (d < minRiverDist) {
          minRiverDist = d;
          if (d < 0.012) break;
        }
      }

      // Physical hazard synthesis
      const slopeFactor = Math.max(0, Math.min(1, (slopeDeg - 14) / 28));
      const rainFactor = Math.max(0, Math.min(1, localRain / 125));
      const lsHazard = slopeFactor * (0.28 + 0.72 * rainFactor);

      const riverFactor = Math.max(0, 1.0 - minRiverDist / 0.028);
      const valleyFactor = Math.max(0, 1.0 - (hMeters - minElev) / 3200);
      const flHazard = riverFactor * valleyFactor * Math.max(0, Math.min(1, localRain / 80));

      let H = 0;
      if (hazardMode === "landslide") H = lsHazard;
      else if (hazardMode === "flood") H = flHazard;
      else H = Math.max(lsHazard, flHazard) * 0.72 + Math.min(lsHazard, flHazard) * 0.28;

      if (minStationDist < 0.09) {
        const alpha = Math.exp(-Math.pow(minStationDist / 0.045, 2));
        H = H * (1 - alpha) + localStationScore * alpha;
      }
      H = Math.max(0.02, Math.min(0.98, H));

      // Continuous 4-color thermal palette
      let red = 22;
      let green = 163;
      let blue = 74;

      if (H < 0.25) {
        const t = H / 0.25;
        red = Math.round(22 + (101 - 22) * t);
        green = Math.round(163 + (163 - 163) * t);
        blue = Math.round(74 + (13 - 74) * t);
      } else if (H < 0.5) {
        const t = (H - 0.25) / 0.25;
        red = Math.round(101 + (234 - 101) * t);
        green = Math.round(163 + (179 - 163) * t);
        blue = Math.round(13 + (8 - 13) * t);
      } else if (H < 0.75) {
        const t = (H - 0.5) / 0.25;
        red = Math.round(234 + (234 - 234) * t);
        green = Math.round(179 + (88 - 179) * t);
        blue = Math.round(8 + (12 - 8) * t);
      } else {
        const t = (H - 0.75) / 0.25;
        red = Math.round(234 + (185 - 234) * t);
        green = Math.round(88 + (28 - 88) * t);
        blue = Math.round(12 + (28 - 12) * t);
      }

      data[pixelIndex] = red;
      data[pixelIndex + 1] = green;
      data[pixelIndex + 2] = blue;
      data[pixelIndex + 3] = 225; // 88% alpha
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
