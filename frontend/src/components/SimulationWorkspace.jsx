import React, { useState, useEffect, useRef, useMemo } from "react";
import SimulationMapView, { EXTENDED_TEESTA_SYSTEM } from "./SimulationMapView";
import SimulationTerrain3DView from "./SimulationTerrain3DView";
import defaultSatelliteDem from "../data/sikkim_satellite_dem.json";
import { SIKKIM_SETTLEMENTS, ROAD_CORRIDORS } from "../data/mockPopulation";
import {
  getDailySimulationState,
  getCalendarDate,
  getSeason,
  TOTAL_SIMULATION_DAYS,
} from "../data/annualSimulationTimeline";

const ALL_ZONES = ["LOC01", "LOC02", "LOC03", "LOC04", "LOC05", "LOC06"];

export const LOCATION_ROAD_NAMES = {
  LOC01: "SH-1/2 Chungthang Confluence Gorge Corridor",
  LOC02: "NH-10 Dikchu River Gorge Corridor",
  LOC03: "Jawaharlal Nehru Road (Nathu La Alpine Ridge Cut)",
  LOC04: "Mangan-Dzongu Upper Ridge Road Cut",
  LOC05: "NH-10 Singtam Riverbank Market & Valley Flat",
  LOC06: "NH-10 Rangpo Border River Delta Corridor",
};

export function getRoadName(locId, siteData) {
  if (siteData?.primary_road_corridor) return siteData.primary_road_corridor;
  return LOCATION_ROAD_NAMES[locId] || siteData?.name || "Mountain Highway Corridor";
}

// ═══ GEODESIC & PROJECTION SPATIAL ANALYSIS ENGINE ═══
function haversineDistMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findClosestPointOnSegment(pLat, pLng, s1Lat, s1Lng, s2Lat, s2Lng) {
  const latAvg = (pLat + s1Lat + s2Lat) / 3.0;
  const mPerDegLat = 111320.0;
  const mPerDegLon = 111320.0 * Math.cos(latAvg * Math.PI / 180);
  const px = pLng * mPerDegLon, py = pLat * mPerDegLat;
  const x1 = s1Lng * mPerDegLon, y1 = s1Lat * mPerDegLat;
  const x2 = s2Lng * mPerDegLon, y2 = s2Lat * mPerDegLat;
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { distM: haversineDistMeters(pLat, pLng, s1Lat, s1Lng), point: [s1Lat, s1Lng] };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx, projY = y1 + t * dy;
  const projLat = projY / mPerDegLat, projLng = projX / mPerDegLon;
  const distM = Math.hypot(px - projX, py - projY);
  return { distM, point: [projLat, projLng] };
}

const RIVER_ADJACENCY_THRESHOLD_M = 500; // 500 meters threshold: only connect if on/adjacent to river channel

function traceRiverDownstream(lat, lng, allRivers = EXTENDED_TEESTA_SYSTEM) {
  let minD = Infinity;
  let bestRiver = null;
  let bestPt = [lat, lng];
  let bestIdx = 0;

  allRivers.forEach((r) => {
    const pts = r.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const res = findClosestPointOnSegment(lat, lng, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (res.distM < minD) {
        minD = res.distM;
        bestRiver = r;
        bestPt = res.point;
        bestIdx = i;
      }
    }
  });

  const isConnected = bestRiver != null && minD <= RIVER_ADJACENCY_THRESHOLD_M;

  if (!bestRiver || !isConnected) {
    return {
      nearestRiver: bestRiver ? {
        name: bestRiver.name || "Teesta River System",
        id: bestRiver.id,
        distanceM: Math.round(minD),
        distanceKm: (minD / 1000).toFixed(2),
        closestPoint: bestPt,
      } : null,
      isConnectedToRiver: false,
      feederVector: null,
      downstreamRiverPath: null,
      downstreamRegions: [],
      downstreamVillages: [],
    };
  }

  const pts = bestRiver.points || [];
  // In Sikkim, rivers flow generally North to South (decreasing latitude)
  const isForwardDown = pts.length > 1 && pts[pts.length - 1][0] < pts[0][0];
  const downstreamPts = [bestPt];
  if (isForwardDown) {
    downstreamPts.push(...pts.slice(bestIdx + 1));
  } else {
    downstreamPts.push(...[...pts.slice(0, bestIdx + 1)].reverse());
  }

  // Chain subsequent connected river reaches downstream
  let currentEnd = downstreamPts[downstreamPts.length - 1];
  const visited = new Set([bestRiver.id]);

  for (let step = 0; step < 6; step++) {
    let nextReach = null;
    let minGap = 2000; // 2km confluence threshold
    allRivers.forEach((r) => {
      if (visited.has(r.id)) return;
      const rpts = r.points || [];
      if (rpts.length < 2) return;
      const dStart = haversineDistMeters(currentEnd[0], currentEnd[1], rpts[0][0], rpts[0][1]);
      const dEnd = haversineDistMeters(currentEnd[0], currentEnd[1], rpts[rpts.length - 1][0], rpts[rpts.length - 1][1]);
      if (dStart < minGap && rpts[rpts.length - 1][0] < rpts[0][0]) {
        minGap = dStart;
        nextReach = { river: r, reverse: false };
      } else if (dEnd < minGap && rpts[0][0] < rpts[rpts.length - 1][0]) {
        minGap = dEnd;
        nextReach = { river: r, reverse: true };
      }
    });

    if (!nextReach) break;
    visited.add(nextReach.river.id);
    const rpts = nextReach.river.points || [];
    const added = nextReach.reverse ? [...rpts].reverse() : rpts;
    downstreamPts.push(...added);
    currentEnd = downstreamPts[downstreamPts.length - 1];
  }

  // Identify downstream pilot stations and settlements along this river corridor
  const PILOT_STATIONS = [
    { id: "LOC04", name: "Lachen Alpine Valley", lat: 27.72 },
    { id: "LOC03", name: "Lachung High Ridge", lat: 27.69 },
    { id: "LOC01", name: "Mangan District HQ", lat: 27.50 },
    { id: "LOC02", name: "Dikchu River Confluence", lat: 27.39 },
    { id: "LOC05", name: "Singtam Urban Basin", lat: 27.24 },
    { id: "LOC06", name: "Rangpo Border Delta", lat: 27.17 },
  ];

  const downstreamRegions = [];
  PILOT_STATIONS.forEach((stn) => {
    if (stn.lat < lat + 0.02) {
      downstreamRegions.push(stn);
    }
  });

  const SIKKIM_TOWNS = [
    { name: "Chungthang", lat: 27.60 },
    { name: "Mangan", lat: 27.51 },
    { name: "Dikchu", lat: 27.39 },
    { name: "Singtam", lat: 27.24 },
    { name: "Rangpo", lat: 27.17 },
    { name: "Melli", lat: 27.09 },
    { name: "Teesta Bazar", lat: 27.04 },
  ];

  const downstreamVillages = [];
  SIKKIM_TOWNS.forEach((t) => {
    if (t.lat < lat + 0.02) {
      downstreamVillages.push(t.name);
    }
  });

  return {
    nearestRiver: {
      name: bestRiver.name || "Teesta River Main Stem",
      id: bestRiver.id,
      distanceM: Math.round(minD),
      distanceKm: (minD / 1000).toFixed(2),
      closestPoint: bestPt,
    },
    isConnectedToRiver: true,
    feederVector: [[lat, lng], bestPt],
    downstreamRiverPath: downstreamPts,
    downstreamRegions,
    downstreamVillages,
  };
}

function analyzeCustomCoordinates(lat, lng) {
  // 1. Closest Village in Sikkim Settlements
  let nearestVillage = null;
  let minVDist = Infinity;
  SIKKIM_SETTLEMENTS.forEach((v) => {
    const d = haversineDistMeters(lat, lng, v.latitude, v.longitude);
    if (d < minVDist) {
      minVDist = d;
      nearestVillage = {
        name: v.name,
        distanceM: Math.round(d),
        distanceKm: (d / 1000).toFixed(2),
        population: v.population,
        category: v.category,
        latitude: v.latitude,
        longitude: v.longitude,
      };
    }
  });

  // 2. Closest Highway Road in Road Corridors
  let nearestRoad = null;
  let minRDist = Infinity;
  let closestRoadPt = [lat, lng];
  ROAD_CORRIDORS.forEach((road) => {
    const pts = road.points || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const res = findClosestPointOnSegment(lat, lng, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (res.distM < minRDist) {
        minRDist = res.distM;
        closestRoadPt = res.point;
        nearestRoad = {
          name: road.name,
          category: road.category,
          distanceM: Math.round(res.distM),
          distanceKm: (res.distM / 1000).toFixed(2),
          closestPoint: res.point,
        };
      }
    }
  });

  // 3. Trace Real OSM River Downstream (Only if actually adjacent <= 500m)
  const riverTrace = traceRiverDownstream(lat, lng, EXTENDED_TEESTA_SYSTEM);

  // Dynamic Satellite DEM Elevation Sampling (SRTM / Copernicus 90m)
  let satElevation = 1200;
  let computedSlope = 32;
  if (defaultSatelliteDem && defaultSatelliteDem.elevations) {
    const minLat = defaultSatelliteDem.bbox?.minLat ?? 27.10;
    const maxLat = defaultSatelliteDem.bbox?.maxLat ?? 27.75;
    const minLng = defaultSatelliteDem.bbox?.minLng ?? 88.35;
    const maxLng = defaultSatelliteDem.bbox?.maxLng ?? 88.85;
    const grid = defaultSatelliteDem.grid_size || 25;

    const normX = Math.max(0, Math.min(1, (lng - minLng) / (maxLng - minLng)));
    const normZ = Math.max(0, Math.min(1, (maxLat - lat) / (maxLat - minLat)));

    const gx = normX * (grid - 1);
    const gz = normZ * (grid - 1);
    const c0 = Math.floor(gx);
    const c1 = Math.min(grid - 1, c0 + 1);
    const r0 = Math.floor(gz);
    const r1 = Math.min(grid - 1, r0 + 1);

    const fx = gx - c0;
    const fz = gz - r0;

    const e00 = defaultSatelliteDem.elevations[r0 * grid + c0] ?? 1200;
    const e10 = defaultSatelliteDem.elevations[r0 * grid + c1] ?? 1200;
    const e01 = defaultSatelliteDem.elevations[r1 * grid + c0] ?? 1200;
    const e11 = defaultSatelliteDem.elevations[r1 * grid + c1] ?? 1200;

    const eTop = e00 * (1 - fx) + e10 * fx;
    const eBot = e01 * (1 - fx) + e11 * fx;
    satElevation = Math.round(eTop * (1 - fz) + eBot * fz);

    // Compute terrain gradient slope in degrees from cell differences
    const dxMeters = ((maxLng - minLng) / grid) * 111320 * Math.cos(lat * Math.PI / 180);
    const dzMeters = ((maxLat - minLat) / grid) * 111320;
    const gradX = Math.abs(e10 - e00) / dxMeters;
    const gradZ = Math.abs(e01 - e00) / dzMeters;
    const grad = Math.hypot(gradX, gradZ);
    computedSlope = Math.max(6, Math.min(52, Math.round((Math.atan(grad) * 180 / Math.PI) * 4.2)));
    if (riverTrace.isConnectedToRiver && satElevation < 600) {
      computedSlope = Math.min(10, computedSlope); // River basin flat
    }
  }

  let typology = "LANDSLIDE_ONLY";
  let typologyLabel = "🏔️ Mountain Ridge / Pass";
  if (riverTrace.isConnectedToRiver && computedSlope > 22) {
    typology = "COMPOUND";
    typologyLabel = "🔮 Compound River Gorge";
  } else if (riverTrace.isConnectedToRiver) {
    typology = "FLOOD_ONLY";
    typologyLabel = "🌊 Valley River Plain";
  }

  return {
    nearestVillage,
    nearestRoad,
    nearestRiver: riverTrace.nearestRiver,
    isConnectedToRiver: riverTrace.isConnectedToRiver,
    elevation_m: satElevation,
    slope_deg: computedSlope,
    downstreamRiverPath: riverTrace.downstreamRiverPath,
    downstreamRegions: riverTrace.downstreamRegions,
    downstreamVillages: riverTrace.downstreamVillages,
    typology,
    typologyLabel,
    connections: {
      isConnectedToRiver: riverTrace.isConnectedToRiver,
      feederVector: riverTrace.feederVector,
      downstreamRiverPath: riverTrace.downstreamRiverPath,
      closestPoint: riverTrace.isConnectedToRiver ? riverTrace.nearestRiver?.closestPoint : null,
    },
  };
}

export default function SimulationWorkspace() {
  const [viewDimension, setViewDimension] = useState("2d"); // Default to 2D Leaflet interactive map
  const [hazardMode, setHazardMode] = useState("compound"); // "compound" | "flood" | "landslide"
  const [showPeople, setShowPeople] = useState(true);
  const [showInfrastructure, setShowInfrastructure] = useState(true);
  const [regionFilter, setRegionFilter] = useState("all"); // "all" | "landslide_only" | "flood_only" | "compound"
  const [selectedSite, setSelectedSite] = useState(null); // No popup open on startup
  const [isDeckCollapsed, setIsDeckCollapsed] = useState(false); // Collapsible mission control deck
  const [expandedRegions, setExpandedRegions] = useState({});
  const [dismissedAlertDay, setDismissedAlertDay] = useState(null);

  // Custom User Dropped Points on Map
  const [customSites, setCustomSites] = useState([]);
  const [isPickingLocation, setIsPickingLocation] = useState(false);

  // 3D Terrain Specific Menu Controls (lifted to upper menu deck)
  const [textureMode, setTextureMode] = useState("satellite"); // "satellite" | "topo" | "hazard"
  const [vertExaggeration, setVertExaggeration] = useState(1.4);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [flowSpeed, setFlowSpeed] = useState(1.0);

  // 153-Day Monsoon Crisis Simulation Engine (June 1 - October 31)
  const [dayOfYear, setDayOfYear] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5x, 1x, 2x, 3x
  const timerRef = useRef(null);

  const annualFrame = getDailySimulationState(dayOfYear, {});
  const dateInfo = getCalendarDate(dayOfYear);
  const seasonInfo = getSeason(dayOfYear);

  const activeSimSites = {
    ...annualFrame.regions,
  };

  // Dynamically integrate custom sites into the daily simulation frame
  customSites.forEach((cs) => {
    const dayProgress = Math.max(1, Math.min(TOTAL_SIMULATION_DAYS, dayOfYear));
    const peakFactor = Math.exp(-Math.pow((dayProgress - 60) / 25, 2));
    const dailyRain = Math.round(14 + peakFactor * 145);
    const rainIntensity = (dailyRain / 12.0).toFixed(1);

    const baseFos = 1.8 - (cs.slope_deg / 45.0) * 0.8;
    const currentFos = Math.max(0.72, baseFos - (dailyRain / 150.0) * 0.65).toFixed(2);
    const lsProb = Math.min(96, Math.max(8, Math.round((1.7 - currentFos) * 85)));

    const baseQ = 18;
    const currentQ = Math.round(baseQ + peakFactor * (cs.hazard_typology !== "LANDSLIDE_ONLY" ? 82 : 8));
    const stageRise = cs.hazard_typology !== "LANDSLIDE_ONLY" ? (0.3 + peakFactor * 2.8).toFixed(1) : 0;

    let stabilityState = "STABLE";
    let sevBand = "MINOR";
    if (currentFos < 1.0 || lsProb > 75) {
      stabilityState = "UNSTABLE";
      sevBand = "CATASTROPHIC_POTENTIAL";
    } else if (currentFos < 1.3 || lsProb > 45) {
      stabilityState = "MARGINAL";
      sevBand = "MAJOR";
    } else if (currentFos < 1.5) {
      sevBand = "MODERATE";
    }

    let riverState = "NORMAL";
    if (cs.hazard_typology !== "LANDSLIDE_ONLY") {
      if (currentQ > 70) riverState = "CATASTROPHIC_SURGE";
      else if (currentQ > 45) riverState = "OVERBANK_FLOODING";
      else if (currentQ > 28) riverState = "BANKFULL_WARNING";
    }

    activeSimSites[cs.id] = {
      ...cs,
      factor_of_safety: Number(currentFos),
      probability_percent: cs.hazard_typology === "FLOOD_ONLY" ? 5 : lsProb,
      stability_state: cs.hazard_typology === "FLOOD_ONLY" ? "STABLE" : stabilityState,
      severity_band: sevBand,
      rainfall_1h_mm: Number(rainIntensity),
      rainfall_24h_mm: dailyRain,
      peak_discharge_m3s: currentQ,
      inundation_depth_m: Number(stageRise),
      river_stage_state: riverState,
      flood_probability_percent: cs.hazard_typology === "LANDSLIDE_ONLY" ? 0 : Math.min(95, Math.round(peakFactor * 90)),
      compound_active: cs.hazard_typology === "COMPOUND" && currentFos < 1.1 && currentQ > 40,
      compound_pathway: cs.hazard_typology === "COMPOUND" ? "Toe-Erosion Triggered Planar Slip + Damming Risk" : null,
      roadBlocked: currentFos < 0.95 || (cs.hazard_typology !== "LANDSLIDE_ONLY" && currentQ > 65),
    };
  });

  const allZoneIds = [...ALL_ZONES, ...customSites.map((c) => c.id)];

  const displayedList = allZoneIds.filter((locId) => {
    if (regionFilter === "all") return true;
    const r = activeSimSites[locId];
    if (!r) return true;
    if (regionFilter === "landslide_only") return r.hazard_typology === "LANDSLIDE_ONLY";
    if (regionFilter === "flood_only") return r.hazard_typology === "FLOOD_ONLY";
    if (regionFilter === "compound") return r.hazard_typology === "COMPOUND";
    return true;
  });

  // Active severe regions (Landslide OR Flash Flood)
  const severeRegionsList = displayedList.filter((locId) => {
    const r = activeSimSites[locId];
    if (!r) return false;
    const isLsSevere =
      r.hazard_typology !== "FLOOD_ONLY" &&
      (r.severity_band === "CATASTROPHIC_POTENTIAL" ||
        r.severity_band === "MAJOR" ||
        r.stability_state === "UNSTABLE" ||
        (r.factor_of_safety != null && r.factor_of_safety < 1.0) ||
        r.roadBlocked);
    const isFlSevere =
      r.hazard_typology !== "LANDSLIDE_ONLY" &&
      (r.river_stage_state === "OVERBANK_FLOODING" ||
        r.river_stage_state === "CATASTROPHIC_SURGE" ||
        (r.flood_probability_percent != null && r.flood_probability_percent > 65));
    return isLsSevere || isFlSevere;
  });

  let activeRedCount = 0;
  let activeAmberCount = 0;
  displayedList.forEach((id) => {
    const r = activeSimSites[id];
    if (
      (r?.hazard_typology !== "FLOOD_ONLY" && (r?.severity_band === "CATASTROPHIC_POTENTIAL" || r?.stability_state === "UNSTABLE")) ||
      (r?.hazard_typology !== "LANDSLIDE_ONLY" && (r?.river_stage_state === "CATASTROPHIC_SURGE" || r?.river_stage_state === "OVERBANK_FLOODING"))
    ) {
      activeRedCount++;
    } else if (
      (r?.hazard_typology !== "FLOOD_ONLY" && (r?.severity_band === "MAJOR" || r?.stability_state === "MARGINAL")) ||
      (r?.hazard_typology !== "LANDSLIDE_ONLY" && r?.river_stage_state === "BANKFULL_WARNING")
    ) {
      activeAmberCount++;
    }
  });

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(30, Math.round(280 / playbackSpeed));
      timerRef.current = setInterval(() => {
        setDayOfYear((prev) => {
          if (prev >= TOTAL_SIMULATION_DAYS) {
            setIsPlaying(false);
            return TOTAL_SIMULATION_DAYS;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed]);

  function handlePlayPause() {
    if (dayOfYear >= TOTAL_SIMULATION_DAYS) {
      setDayOfYear(1);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  }

  function handleReplay() {
    setDismissedAlertDay(null);
    setDayOfYear(1);
    setIsPlaying(true);
  }

  function toggleRegion(locId) {
    setExpandedRegions((prev) => ({
      ...prev,
      [locId]: !prev[locId],
    }));
  }

  function handleCardClick(locId) {
    setSelectedSite(locId);
    toggleRegion(locId);
  }

  function handleSelectFromMap(locId) {
    setSelectedSite(locId);
    setExpandedRegions((prev) => ({
      ...prev,
      [locId]: true,
    }));
  }

  function handleExpandAll() {
    const all = {};
    allZoneIds.forEach((id) => { all[id] = true; });
    setExpandedRegions(all);
  }

  function handleCollapseAll() {
    setExpandedRegions({});
  }

  // Handle adding custom site from map click
  function handleAddCustomPoint(lat, lng) {
    const analysis = analyzeCustomCoordinates(lat, lng);
    const newId = `CUST_${Date.now().toString().slice(-4)}`;
    const newSite = {
      id: newId,
      location_id: newId,
      name: `Custom Point #${customSites.length + 1} (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)`,
      latitude: lat,
      longitude: lng,
      elevation_m: analysis.elevation_m,
      slope_deg: analysis.slope_deg,
      roadName: analysis.nearestRoad?.name || "Mountain Access Corridor",
      primary_road_corridor: analysis.nearestRoad?.name || "Mountain Access Corridor",
      hazard_typology: analysis.typology,
      typology_label: analysis.typologyLabel,
      isCustom: true,
      isConnectedToRiver: analysis.isConnectedToRiver,
      nearestVillage: analysis.nearestVillage,
      nearestRoad: analysis.nearestRoad,
      nearestRiver: analysis.nearestRiver,
      downstreamRiverPath: analysis.downstreamRiverPath,
      downstreamVillages: analysis.downstreamVillages,
      downstreamRegions: analysis.downstreamRegions,
      connections: analysis.connections,
    };

    setCustomSites((prev) => [...prev, newSite]);
    setSelectedSite(newId);
    setExpandedRegions((prev) => ({ ...prev, [newId]: true }));
    setIsPickingLocation(false);
  }

  function handleRemoveCustomSite(id) {
    setCustomSites((prev) => prev.filter((s) => s.id !== id));
    if (selectedSite === id) {
      setSelectedSite("LOC01");
    }
  }

  function handleClearCustomSites() {
    setCustomSites([]);
    if (selectedSite.startsWith("CUST_")) {
      setSelectedSite("LOC01");
    }
  }

  // Real-Time Active Critical Hazard Directives (Updates dynamically with simulation day)
  const activeCrisisAlerts = useMemo(() => {
    return displayedList
      .map((locId) => {
        const r = activeSimSites[locId];
        if (!r) return null;

        const isLsSevere =
          r.hazard_typology !== "FLOOD_ONLY" &&
          (r.severity_band === "CATASTROPHIC_POTENTIAL" ||
            r.stability_state === "UNSTABLE" ||
            (r.factor_of_safety != null && r.factor_of_safety < 1.0));

        const isFlSevere =
          r.hazard_typology !== "LANDSLIDE_ONLY" &&
          (r.river_stage_state === "CATASTROPHIC_SURGE" ||
            r.river_stage_state === "OVERBANK_FLOODING" ||
            (r.flood_probability_percent != null && r.flood_probability_percent > 70));

        if (!isLsSevere && !isFlSevere) return null;

        const roadName = getRoadName(locId, r);
        const prob = Math.round(r.probability_percent || 75);
        const floodQ = Math.round(r.peak_discharge_m3s || 45);
        const floodDepth = (r.inundation_depth_m || 1.0).toFixed(1);

        let title = `⚠️ ${r.name} - Elevated Alert`;
        let alertMessage = "";
        let actionDirective = "";

        if (isLsSevere && isFlSevere) {
          title = `🚨 COMPOUND CRISIS: ${r.name}`;
          alertMessage = `CRITICAL DUAL HAZARD: Severe slope failure risk (${prob}%) coinciding with catastrophic river surge (Q = ${floodQ} m³/s, +${floodDepth}m stage rise). Extreme toe scour and highway severance imminent!`;
          actionDirective = `ORDER IMMEDIATE DUAL EVACUATION of valley settlements and hillside homes. Close ${roadName} to all traffic immediately.`;
        } else if (isFlSevere) {
          title = `🌊 FLASH FLOOD WARNING: ${r.name}`;
          alertMessage = `TEESTA OVERBANK FLOODING: Hydraulic discharge ${floodQ} m³/s with +${floodDepth}m overbank surge along ${roadName}.`;
          actionDirective = `EVACUATE LOW-LYING BASIN SETTLEMENTS to designated high-ground flood shelters. Halt all riverbank activities.`;
        } else {
          title = `🏔️ LANDSLIDE EMERGENCY: ${r.name}`;
          alertMessage = `SLOPE COLLAPSE IMMINENT: Regolith saturated, Factor of Safety dropped to ${r.factor_of_safety}. Severe planar slip & rockfall predicted across ${roadName}.`;
          actionDirective = `DISPATCH EVACUATION SIRENS to slope dwellers. Halt highway traffic and clear corridor perimeter.`;
        }

        return {
          locId,
          name: r.name,
          roadName,
          roadBlocked: r.roadBlocked,
          day: dayOfYear,
          dateString: dateInfo.dateString,
          probability: prob,
          title,
          alertMessage,
          actionDirective,
          isLsSevere,
          isFlSevere,
          isCompound: isLsSevere && isFlSevere,
          severity: isLsSevere && isFlSevere ? "COMPOUND_CRITICAL" : isFlSevere ? "FLOOD_SURGE" : "CATASTROPHIC_POTENTIAL",
        };
      })
      .filter(Boolean);
  }, [displayedList, activeSimSites, dayOfYear, dateInfo.dateString]);

  return (
    <div className="sim-workspace-layout">
      {/* Main Simulation Map View (Left / Center) */}
      <div className="sim-map-container">
        {/* ═══ UNIFIED SIMULATION MISSION CONTROL DECK (TOP CARD ABOVE MAP) ═══ */}
        {isDeckCollapsed ? (
          /* Collapsed Mode: Ultra-slim, fits strictly in just ONE single line */
          <div className="sim-mission-control-deck collapsed">
            {/* Play/Pause Button */}
            <button
              className={`sim-deck-play-btn ${isPlaying ? "playing" : ""}`}
              onClick={handlePlayPause}
            >
              {isPlaying ? "⏸️ Pause" : dayOfYear >= TOTAL_SIMULATION_DAYS ? "🔄 Replay" : "▶️ Play"}
            </button>

            {/* Time Bar Scrubber Slider */}
            <input
              type="range"
              min={1}
              max={TOTAL_SIMULATION_DAYS}
              value={dayOfYear}
              onChange={(e) => setDayOfYear(parseInt(e.target.value, 10))}
              className="sim-deck-slider"
              title="Drag to scrub through 153-day monsoon timeline"
            />

            {/* Month Milestones Time Bar */}
            <div className="sim-deck-month-milestones">
              {[
                { name: "Jun", day: 1, color: "#0284c7" },
                { name: "Jul", day: 31, color: "#dc2626" },
                { name: "Aug", day: 62, color: "#dc2626" },
                { name: "Sep", day: 93, color: "#ea580c" },
                { name: "Oct", day: 123, color: "#16a34a" },
              ].map((m) => (
                <button
                  key={m.name}
                  className="sim-month-jump-chip"
                  onClick={() => setDayOfYear(m.day)}
                  style={{ color: m.color }}
                  title={`Jump timeline to ${m.name}`}
                >
                  • {m.name}
                </button>
              ))}
            </div>

            {/* Date Pill */}
            <span className="sim-collapsed-date">
              Day {dayOfYear} ({dateInfo.dateString.slice(0, 6)})
            </span>

            {/* Expand Controls Button */}
            <button
              className="sim-deck-expand-btn"
              onClick={() => setIsDeckCollapsed(false)}
              title="Expand full mission control deck"
            >
              🔽 Expand
            </button>
          </div>
        ) : (
          /* Expanded Full Mode */
          <div className="sim-mission-control-deck">
            {/* Upper Deck Row: Timeline Status, Player, Controls, and Collapse Button */}
            <div className="sim-deck-upper-row">
              {/* Left: Date & Season Identity */}
              <div className="sim-date-identity-block">
                <div className="sim-date-heading">
                  <span style={{ fontSize: "1.05rem" }}>📅</span>
                  <strong className="sim-date-text">{dateInfo.dateString}</strong>
                  <span className="sim-day-pill">Day {dayOfYear} / {TOTAL_SIMULATION_DAYS}</span>
                  <span className="sim-season-badge" title={`${seasonInfo.name}: ${seasonInfo.desc}`}>
                    {seasonInfo.icon} {seasonInfo.name}
                  </span>
                </div>
              </div>

              {/* Center: Playback Controls */}
              <div className="sim-deck-player-controls">
                <button
                  className={`sim-deck-play-btn ${isPlaying ? "playing" : ""}`}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? "⏸️ Pause" : dayOfYear >= TOTAL_SIMULATION_DAYS ? "🔄 Replay" : "▶️ Play"}
                </button>
                <button className="sim-deck-reset-btn" onClick={handleReplay} title="Reset to June 1">
                  🔄 Reset
                </button>
                <div className="sim-deck-speed-group">
                  {[0.5, 1, 2, 3].map((spd) => (
                    <button
                      key={spd}
                      className={`sim-deck-speed-chip ${playbackSpeed === spd ? "active" : ""}`}
                      onClick={() => setPlaybackSpeed(spd)}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Map Layer Toggles, Custom Point Dropper, & Live Threat Status */}
              <div className="sim-deck-status-block">
                <div className="sim-deck-toggles">
                  <button
                    className={`sim-deck-pill-btn ${showPeople ? "active" : ""}`}
                    onClick={() => setShowPeople(!showPeople)}
                    title="Toggle citizen observer pins on map"
                  >
                    👥 Citizens: {showPeople ? "ON" : "OFF"}
                  </button>
                  <button
                    className={`sim-deck-pill-btn ${showInfrastructure ? "active" : ""}`}
                    onClick={() => setShowInfrastructure(!showInfrastructure)}
                    title="Toggle government highways & settlements"
                  >
                    🛣️ Highways: {showInfrastructure ? "ON" : "OFF"}
                  </button>
                  <button
                    className={`sim-deck-pill-btn ${isPickingLocation ? "active" : ""}`}
                    onClick={() => setIsPickingLocation(!isPickingLocation)}
                    style={{
                      borderColor: isPickingLocation ? "#0284c7" : "#cbd5e1",
                      background: isPickingLocation ? "#0284c7" : "#ffffff",
                      color: isPickingLocation ? "#ffffff" : "#334155",
                      fontWeight: 700,
                    }}
                    title="Click anywhere on the terrain/map to add a custom monitoring site"
                  >
                    {isPickingLocation ? "🎯 Click Map to Drop Pin" : "📍 + Add Point"}
                  </button>
                  {customSites.length > 0 && (
                    <button
                      onClick={handleClearCustomSites}
                      style={{
                        padding: "3px 7px",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        borderRadius: 5,
                        border: "1px solid #fca5a5",
                        background: "#fef2f2",
                        color: "#dc2626",
                        cursor: "pointer",
                      }}
                      title="Clear custom dropped sites"
                    >
                      🗑️ ({customSites.length})
                    </button>
                  )}
                  <button
                    className={`sim-deck-pill-btn ${viewDimension === "3d" ? "active" : ""}`}
                    onClick={() => setViewDimension(viewDimension === "3d" ? "2d" : "3d")}
                    style={{
                      fontWeight: 700,
                      background: viewDimension === "3d" ? "#0284c7" : "#ffffff",
                      color: viewDimension === "3d" ? "#ffffff" : "#0284c7",
                      borderColor: "#0284c7",
                    }}
                    title="Toggle between 3D Satellite Terrain and 2D Leaflet Map"
                  >
                    {viewDimension === "3d" ? "🏔️ 3D Terrain Model (Active)" : "🗺️ 2D Map View"}
                  </button>
                </div>

                {activeRedCount > 0 ? (
                  <div className="sim-deck-hazard-badge danger">
                    <span className="pulse-danger-dot" />
                    <span>🚨 ACTIVE CRISIS ({activeRedCount})</span>
                  </div>
                ) : activeAmberCount > 0 ? (
                  <div className="sim-deck-hazard-badge warning">
                    <span>⚠️ ELEVATED PRESSURE</span>
                  </div>
                ) : (
                  <div className="sim-deck-hazard-badge normal">
                    <span>🟢 NOMINAL STABILITY</span>
                  </div>
                )}

                {/* Collapse Button */}
                <button
                  onClick={() => setIsDeckCollapsed(true)}
                  style={{
                    padding: "4px 9px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                  title="Collapse controls into a compact single-line time bar"
                >
                  ▲ Collapse
                </button>
              </div>
            </div>

            {/* Lower Deck Row: Scrubber Slider with Clickable Month Milestones */}
            <div className="sim-deck-scrubber-row">
              <input
                type="range"
                min={1}
                max={TOTAL_SIMULATION_DAYS}
                value={dayOfYear}
                onChange={(e) => setDayOfYear(parseInt(e.target.value, 10))}
                className="sim-deck-slider"
                title="Drag to scrub through 153-day monsoon timeline"
              />
              <div className="sim-deck-month-milestones">
                {[
                  { name: "Jun (Onset 🌧️)", day: 1, color: "#0284c7" },
                  { name: "Jul (Cloudburst ⚡)", day: 31, color: "#dc2626" },
                  { name: "Aug (Peak Deluge ⚡)", day: 62, color: "#dc2626" },
                  { name: "Sep (Late Runoff ⛈️)", day: 93, color: "#ea580c" },
                  { name: "Oct (Seepage 🍂)", day: 123, color: "#16a34a" },
                ].map((m) => (
                  <button
                    key={m.name}
                    className="sim-month-jump-chip"
                    onClick={() => setDayOfYear(m.day)}
                    style={{ color: m.color }}
                    title={`Jump timeline to ${m.name}`}
                  >
                    • {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional 3D Terrain Menu Controls (Rendered ONLY in 3D Mode) */}
            {viewDimension === "3d" && (
              <div
                className="sim-deck-3d-toolbar"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "6px 14px",
                  background: "#f8fafc",
                  borderTop: "1px solid #e2e8f0",
                  borderRadius: "0 0 8px 8px",
                  boxSizing: "border-box",
                }}
              >
                {/* Surface Texture Selector */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                    3D Surface:
                  </span>
                  <button
                    onClick={() => setTextureMode("satellite")}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      borderRadius: 4,
                      border: textureMode === "satellite" ? "1px solid #0284c7" : "1px solid #cbd5e1",
                      background: textureMode === "satellite" ? "#0284c7" : "#ffffff",
                      color: textureMode === "satellite" ? "#ffffff" : "#334155",
                      cursor: "pointer",
                    }}
                  >
                    🛰️ Satellite
                  </button>
                  <button
                    onClick={() => setTextureMode("topo")}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      borderRadius: 4,
                      border: textureMode === "topo" ? "1px solid #0f766e" : "1px solid #cbd5e1",
                      background: textureMode === "topo" ? "#0f766e" : "#ffffff",
                      color: textureMode === "topo" ? "#ffffff" : "#334155",
                      cursor: "pointer",
                    }}
                  >
                    🗺️ Topo DEM
                  </button>
                  <button
                    onClick={() => setTextureMode("hazard")}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      borderRadius: 4,
                      border: textureMode === "hazard" ? "1px solid #dc2626" : "1px solid #cbd5e1",
                      background: textureMode === "hazard" ? "#dc2626" : "#ffffff",
                      color: textureMode === "hazard" ? "#ffffff" : "#334155",
                      cursor: "pointer",
                    }}
                  >
                    🔥 Severity Heatmap
                  </button>
                </div>

                {/* 3D Physical & Camera Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* Vertical Relief Slider */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "#475569" }}>
                    <span style={{ fontWeight: 600 }}>Relief:</span>
                    <input
                      type="range"
                      min="0.8"
                      max="2.4"
                      step="0.1"
                      value={vertExaggeration}
                      onChange={(e) => setVertExaggeration(parseFloat(e.target.value))}
                      style={{ width: 60, cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 700, minWidth: 26, color: "#0f172a" }}>{vertExaggeration.toFixed(1)}×</span>
                  </div>

                  {/* River Flow Animation Toggle */}
                  <button
                    onClick={() => setFlowSpeed((s) => (s > 0 ? 0 : 1.0))}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "1px solid #0284c7",
                      background: flowSpeed > 0 ? "#e0f2fe" : "#ffffff",
                      color: flowSpeed > 0 ? "#0369a1" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    🌊 {flowSpeed > 0 ? "River Flowing" : "Flow Paused"}
                  </button>

                  {/* Wireframe Toggle */}
                  <button
                    onClick={() => setShowWireframe(!showWireframe)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      background: showWireframe ? "#e2e8f0" : "#ffffff",
                      color: "#334155",
                      cursor: "pointer",
                    }}
                  >
                    📐 Wireframe
                  </button>

                  {/* Orbit Toggle */}
                  <button
                    onClick={() => setAutoRotate(!autoRotate)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      borderRadius: 4,
                      border: "1px solid #cbd5e1",
                      background: autoRotate ? "#f0fdf4" : "#ffffff",
                      color: autoRotate ? "#15803d" : "#64748b",
                      cursor: "pointer",
                    }}
                  >
                    {autoRotate ? "⏸ Orbit" : "▶ Orbit"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dedicated Map Body */}
        <div className="sim-map-view-body">
          {viewDimension === "3d" ? (
            <SimulationTerrain3DView
              sites={activeSimSites}
              selectedSite={selectedSite}
              onSelectSite={handleSelectFromMap}
              showPeople={showPeople}
              showInfrastructure={showInfrastructure}
              hazardMode={hazardMode}
              setHazardMode={setHazardMode}
              isPickingLocation={isPickingLocation}
              setIsPickingLocation={setIsPickingLocation}
              onMapClick={handleAddCustomPoint}
              customSites={customSites}
              onClearCustomSites={handleClearCustomSites}
              viewDimension={viewDimension}
              setViewDimension={setViewDimension}
              textureMode={textureMode}
              setTextureMode={setTextureMode}
              vertExaggeration={vertExaggeration}
              setVertExaggeration={setVertExaggeration}
              showWireframe={showWireframe}
              setShowWireframe={setShowWireframe}
              autoRotate={autoRotate}
              setAutoRotate={setAutoRotate}
              flowSpeed={flowSpeed}
              setFlowSpeed={setFlowSpeed}
            />
          ) : (
            <SimulationMapView
              sites={activeSimSites}
              selectedSite={selectedSite}
              onSelectSite={handleSelectFromMap}
              showPeople={showPeople}
              showInfrastructure={showInfrastructure}
              hazardMode={hazardMode}
              setHazardMode={setHazardMode}
              isPickingLocation={isPickingLocation}
              setIsPickingLocation={setIsPickingLocation}
              onMapClick={handleAddCustomPoint}
              customSites={customSites}
              onClearCustomSites={handleClearCustomSites}
              viewDimension={viewDimension}
              setViewDimension={setViewDimension}
            />
          )}
        </div>
      </div>

      {/* Right Column: Region Hazard Cards */}
      <div className="sim-regions-column">
        {/* Right Column Header */}
        <div className="sim-regions-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 8 }}>
            <div>
              <h3 style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0f172a" }}>
                Monitoring Sites ({displayedList.length})
              </h3>
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                Click card to expand technical telemetry
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {customSites.length > 0 && (
                <button
                  className="sim-header-action-btn"
                  onClick={handleClearCustomSites}
                  title="Remove all custom dropped points"
                  style={{ color: "#dc2626", fontWeight: 700 }}
                >
                  🗑️ Clear Custom ({customSites.length})
                </button>
              )}
              <button
                className="sim-header-action-btn"
                onClick={handleExpandAll}
                title="Expand all cards"
              >
                ▾ Expand All
              </button>
              <button
                className="sim-header-action-btn"
                onClick={handleCollapseAll}
                title="Minimize all cards"
              >
                ▸ Minimize All
              </button>
            </div>
          </div>

          <div className="sim-filter-toggle">
            <button
              className={`sim-filter-btn ${regionFilter === "all" ? "active" : ""}`}
              onClick={() => setRegionFilter("all")}
              title="Show all stations with mixed hazard typologies"
            >
              All ({allZoneIds.length})
            </button>
            <button
              className={`sim-filter-btn ${regionFilter === "landslide_only" ? "active" : ""}`}
              onClick={() => setRegionFilter("landslide_only")}
              title="Mountain ridges and passes far away from rivers where only landslides occur"
            >
              🏔️ Ridges
            </button>
            <button
              className={`sim-filter-btn ${regionFilter === "flood_only" ? "active" : ""}`}
              onClick={() => setRegionFilter("flood_only")}
              title="Flat riverbank plains where only flash floods occur"
            >
              🌊 Basins
            </button>
            <button
              className={`sim-filter-btn ${regionFilter === "compound" ? "active" : ""}`}
              onClick={() => setRegionFilter("compound")}
              title="Steep river gorges where both landslides and floods occur"
            >
              🔮 Gorges
            </button>
          </div>
        </div>

        {/* ═══ REAL-TIME DISASTER ALERT DIRECTIVE (TOP OF RIGHT PANEL) ═══ */}
        {activeCrisisAlerts.length > 0 && dismissedAlertDay !== dayOfYear && (
          <div className="sim-panel-alert-banner">
            <div className="sim-panel-alert-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="pulse-danger-dot" />
                <strong className="sim-panel-alert-title">
                  {activeCrisisAlerts.length > 1
                    ? `🚨 MULTI-REGION CRISIS (${activeCrisisAlerts.length} ZONES ACTIVE)`
                    : activeCrisisAlerts[0].title}
                </strong>
              </div>
              <button
                className="sim-panel-alert-close"
                onClick={() => setDismissedAlertDay(dayOfYear)}
                title="Dismiss alert for this day"
              >
                ✕
              </button>
            </div>

            <div className="sim-panel-alert-body">
              {activeCrisisAlerts.length > 1 ? (
                <>
                  <div className="sim-panel-alert-chips">
                    {activeCrisisAlerts.map((a) => (
                      <span
                        key={a.locId}
                        className="sim-panel-alert-chip"
                        onClick={() => {
                          setSelectedSite(a.locId);
                          setExpandedRegions((prev) => ({ ...prev, [a.locId]: true }));
                        }}
                        title={`Focus ${a.name}`}
                      >
                        📍 {a.name.split(" ")[0]} ({a.isCompound ? "Dual" : a.isFlSevere ? "Flood" : "Slide"})
                      </span>
                    ))}
                  </div>
                  <div className="sim-panel-alert-msg">
                    📢 <strong>REGIONAL SYNOPTIC DELUGE:</strong> Simultaneous critical hazards detected across {activeCrisisAlerts.length} sectors along the Teesta corridor. Highway washouts and severe inundation reported.
                  </div>
                  <div className="sim-panel-alert-directive">
                    👉 <strong>Directive:</strong> COORDINATED INTER-AGENCY EVACUATION ACTIVE. Divert NH-10 traffic and activate emergency shelters across all affected zones.
                  </div>
                </>
              ) : (
                <>
                  <div className="sim-panel-alert-location">
                    📍 <strong>{activeCrisisAlerts[0].name}</strong> · {activeCrisisAlerts[0].roadName}
                    {activeCrisisAlerts[0].roadBlocked && (
                      <span className="sim-panel-alert-blocked-badge">⛔ ROAD CUT</span>
                    )}
                  </div>
                  <div className="sim-panel-alert-msg">
                    📢 {activeCrisisAlerts[0].alertMessage}
                    {activeCrisisAlerts[0].roadBlocked ? " Highway corridor is SEVERED by debris." : ""}
                  </div>
                  <div className="sim-panel-alert-directive">
                    👉 <strong>Directive:</strong> {activeCrisisAlerts[0].actionDirective}
                  </div>
                </>
              )}

              <div className="sim-panel-alert-footer">
                <span>📅 {dateInfo.dateString} · Day {dayOfYear}/{TOTAL_SIMULATION_DAYS}</span>
                <span className="sim-panel-alert-broadcast-tag">
                  📱 Auto-Dispatched via SMS Broadcast
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable list of Region Cards */}
        <div className="sim-regions-list">
          {displayedList.map((locId) => {
            const data = activeSimSites[locId];
            if (!data) return null;

            const fos = data.factor_of_safety;
            const probPercent = data.probability_percent;
            const sevBand = data.severity_band || "MINOR";
            const stability = data.stability_state || "STABLE";
            const riverStage = data.river_stage_state || "NORMAL";
            const peakQ = data.peak_discharge_m3s || 12;
            const inundDepth = data.inundation_depth_m || 0.4;
            const floodProb = data.flood_probability_percent || 10;
            const isCompound = data.compound_active;
            const typology = data.hazard_typology || "COMPOUND";

            // ═══ UNIFIED SEVERITY COLOR SYSTEM FOR ALL REGIONS (SAME FOR ALL) ═══
            let sevClass = "severity-minor";
            let badgeText = "Safe";
            let dotColor = "#16a34a"; // green
            let badgeBg = "#dcfce7";
            let badgeTextColor = "#166534";

            if (isCompound || riverStage === "CATASTROPHIC_SURGE" || (typology !== "FLOOD_ONLY" && (sevBand === "CATASTROPHIC_POTENTIAL" || (fos != null && fos < 1.0)))) {
              sevClass = "severity-critical";
              badgeText = isCompound ? "Compound Crisis" : riverStage === "CATASTROPHIC_SURGE" ? "Catastrophic Surge" : "Critical Failure";
              dotColor = "#dc2626"; // red
              badgeBg = "#fee2e2";
              badgeTextColor = "#991b1b";
            } else if (riverStage === "OVERBANK_FLOODING" || (typology !== "FLOOD_ONLY" && (sevBand === "MAJOR" || (fos != null && fos < 1.3)))) {
              sevClass = "severity-major";
              badgeText = riverStage === "OVERBANK_FLOODING" ? "Overbank Flood" : "Major Warning";
              dotColor = "#ea580c"; // orange
              badgeBg = "#ffedd5";
              badgeTextColor = "#c2410c";
            } else if (riverStage === "BANKFULL_WARNING" || (typology !== "FLOOD_ONLY" && (sevBand === "MODERATE" || (fos != null && fos < 1.5)))) {
              sevClass = "severity-moderate";
              badgeText = riverStage === "BANKFULL_WARNING" ? "Bankfull Alert" : "Moderate Warning";
              dotColor = "#d97706"; // amber
              badgeBg = "#fef3c7";
              badgeTextColor = "#92400e";
            }

            const isExpanded = !!expandedRegions[locId];
            const isSelected = selectedSite === locId;

            return (
              <div
                key={locId}
                className={`sim-region-card ${sevClass} ${isSelected ? "selected-card" : ""} ${isExpanded ? "is-expanded" : "is-minimized"}`}
              >
                {/* ═══ MINIMIZED CARD HEADER: ONLY HAZARD COLOR + PLACE NAME + EXPAND ICON ═══ */}
                <div
                  className="sim-region-card-header"
                  onClick={() => handleCardClick(locId)}
                  title={isExpanded ? "Click to minimize card" : "Click to expand card details"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, marginRight: 8 }}>
                    <span
                      className="sim-hazard-dot"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: dotColor,
                        boxShadow: `0 0 6px ${dotColor}`,
                        flexShrink: 0
                      }}
                    />
                    <strong
                      className="sim-place-name-text"
                      style={{
                        fontSize: "0.86rem",
                        color: isSelected ? "#0284c7" : "#0f172a",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {data.name}
                    </strong>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: badgeBg,
                        color: badgeTextColor,
                        border: `1px solid ${dotColor}33`,
                        whiteSpace: "nowrap",
                        minWidth: 84,
                        textAlign: "center",
                        display: "inline-block"
                      }}
                    >
                      {badgeText}
                    </span>
                    <span
                      className="sim-expand-icon"
                      style={{
                        fontSize: "0.85rem",
                        color: isSelected ? "#0284c7" : "#94a3b8",
                        fontWeight: 700
                      }}
                    >
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>
                </div>

                {/* ═══ EXPANDED CARD BODY: ALL TECHNICAL DETAILS REVEALED ═══ */}
                {isExpanded && (
                  <div className="sim-region-card-body">
                    {/* Auto-Detected Spatial Connections for Custom Dropped Sites */}
                    {data.isCustom && (
                      <div style={{ marginBottom: 8, padding: "8px 10px", background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#0369a1", marginBottom: 4 }}>
                          {data.isConnectedToRiver
                            ? "🌊 Real Map River Drainage & Downstream Corridor:"
                            : "🏔️ Inland / Mountain Ridge Point (No direct river corridor):"}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#0f172a", display: "flex", flexDirection: "column", gap: 3 }}>
                          {data.isConnectedToRiver ? (
                            <>
                              <div>🌊 <strong>Adjacent River Channel:</strong> {data.nearestRiver?.name} ({data.nearestRiver?.distanceM}m)</div>
                              {data.downstreamVillages && data.downstreamVillages.length > 0 && (
                                <div>⬇️ <strong>Downstream River Flow Path:</strong> {data.downstreamVillages.join(" ➔ ")}</div>
                              )}
                            </>
                          ) : (
                            <div>🏔️ <strong>Nearest River Channel:</strong> {data.nearestRiver?.name || "Teesta Basin"} ({data.nearestRiver?.distanceKm} km away)</div>
                          )}
                          <div>🏘️ <strong>Nearest Settlement:</strong> {data.nearestVillage?.name} ({data.nearestVillage?.distanceKm} km)</div>
                          <div>🛣️ <strong>Road Access:</strong> {data.nearestRoad?.name} ({data.nearestRoad?.distanceKm ? `${data.nearestRoad.distanceKm} km` : `${data.nearestRoad?.distanceM}m`})</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveCustomSite(locId); }}
                          style={{ marginTop: 6, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", padding: "2px 8px", borderRadius: 4, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}
                        >
                          🗑️ Remove Custom Site
                        </button>
                      </div>
                    )}

                    {/* Subtitle with Location ID, Elevation, Slope, and Primary Road */}
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span><b>{locId}</b></span>
                      <span>·</span>
                      <span>⛰️ Elev {data.elevation_m}m</span>
                      <span>·</span>
                      <span>📐 Slope {data.slope_deg}°</span>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: dotColor + "18",
                          color: dotColor,
                          border: `1px solid ${dotColor}33`,
                          marginLeft: "auto"
                        }}
                      >
                        {data.typology_label || typology}
                      </span>
                    </div>

                    {data.primary_road_corridor && (
                      <div style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 600, marginBottom: 6 }}>
                        🛣️ {data.primary_road_corridor}
                      </div>
                    )}

                    {/* Geomorphic Setting Context Tag */}
                    {data.geomorphic_setting && (
                      <div style={{ fontSize: "0.7rem", color: "#475569", background: "#ffffff", border: "1px solid #e2e8f0", padding: "6px 8px", borderRadius: 4, marginBottom: 8, fontStyle: "italic", lineHeight: 1.4 }}>
                        🌍 <strong>Setting:</strong> {data.geomorphic_setting}
                      </div>
                    )}

                    {/* Section 1: Landslide Geotechnical Telemetry */}
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#475569", marginBottom: 4, textTransform: "uppercase" }}>
                      🏔️ Landslide Geotechnical Telemetry
                    </div>
                    {typology === "FLOOD_ONLY" ? (
                      <div style={{ fontSize: "0.7rem", color: "#166534", background: "#dcfce7", border: "1px solid #86efac", padding: "6px 8px", borderRadius: 4, marginBottom: 8 }}>
                        🟢 <strong>Zero Slope Failure Hazard:</strong> Flat alluvial valley floor (Slope {data.slope_deg}° · Factor of Safety {data.factor_of_safety} Stable). No landslide possible.
                      </div>
                    ) : (
                      <div className="sim-card-metrics-grid" style={{ marginBottom: 8 }}>
                        <div className="sim-card-metric">
                          <span className="scm-label">Factor of Safety</span>
                          <span className="scm-val" style={{ color: fos < 1 ? "#dc2626" : fos < 1.3 ? "#d97706" : "#16a34a" }}>
                            {fos != null ? Number(fos).toFixed(2) : "—"}
                          </span>
                          <span className="scm-sub">{stability}</span>
                        </div>
                        <div className="sim-card-metric">
                          <span className="scm-label">Landslide Risk</span>
                          <span className="scm-val">{probPercent}%</span>
                          <div className="sim-metric-bar">
                            <div style={{ width: `${Math.min(100, probPercent)}%`, background: probPercent > 70 ? "#dc2626" : probPercent > 40 ? "#ea580c" : "#16a34a", height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                        <div className="sim-card-metric">
                          <span className="scm-label">Precipitation</span>
                          <span className="scm-val" style={{ color: "#0284c7" }}>
                            {Number(data.rainfall_1h_mm || 0).toFixed(1)} <span style={{ fontSize: "0.62rem" }}>mm/h</span>
                          </span>
                          <span className="scm-sub">{Number(data.rainfall_24h_mm || 0).toFixed(0)} mm/24h</span>
                        </div>
                      </div>
                    )}

                    {/* Section 2: Hydrological Flash Flood Telemetry */}
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#0284c7", marginBottom: 4, textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>🌊 Teesta Drainage Telemetry</span>
                      <span style={{
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: riverStage === "CATASTROPHIC_SURGE" || riverStage === "OVERBANK_FLOODING" ? "#fee2e2" : riverStage === "BANKFULL_WARNING" ? "#fef3c7" : "#e0f2fe",
                        color: riverStage === "CATASTROPHIC_SURGE" || riverStage === "OVERBANK_FLOODING" ? "#991b1b" : riverStage === "BANKFULL_WARNING" ? "#92400e" : "#0369a1",
                      }}>
                        {riverStage === "CATASTROPHIC_SURGE" ? "🚨 CATASTROPHIC" : riverStage === "OVERBANK_FLOODING" ? "🌊 OVERBANK" : riverStage === "BANKFULL_WARNING" ? "🟡 BANKFULL" : riverStage === "NO_RIVER_ZONE" ? "🟢 NO RIVER" : "🟢 IN-BANK"}
                      </span>
                    </div>
                    {typology === "LANDSLIDE_ONLY" ? (
                      <div style={{ fontSize: "0.7rem", color: "#0369a1", background: "#f0f9ff", border: "1px solid #bae6fd", padding: "6px 8px", borderRadius: 4 }}>
                        🟢 <strong>No River Flood Hazard:</strong> Alpine ridge/pass (&gt;1,400m above valley floor). Zero river surge risk.
                      </div>
                    ) : (
                      <div className="sim-card-metrics-grid">
                        <div className="sim-card-metric">
                          <span className="scm-label">Peak Discharge</span>
                          <span className="scm-val" style={{ color: riverStage === "OVERBANK_FLOODING" || riverStage === "CATASTROPHIC_SURGE" ? "#dc2626" : "#0284c7" }}>
                            {peakQ} <span style={{ fontSize: "0.62rem" }}>m³/s</span>
                          </span>
                          <span className="scm-sub">Hydraulic Q</span>
                        </div>
                        <div className="sim-card-metric">
                          <span className="scm-label">Stage Rise</span>
                          <span className="scm-val" style={{ color: inundDepth > 2.0 ? "#dc2626" : inundDepth > 1.0 ? "#ea580c" : "#0284c7" }}>
                            +{inundDepth}m
                          </span>
                          <span className="scm-sub">{riverStage}</span>
                        </div>
                        <div className="sim-card-metric">
                          <span className="scm-label">Surge Risk</span>
                          <span className="scm-val" style={{ color: floodProb > 70 ? "#dc2626" : floodProb > 40 ? "#ea580c" : "#0284c7" }}>
                            {floodProb}%
                          </span>
                          <span className="scm-sub">Flash Flood</span>
                        </div>
                      </div>
                    )}

                    {/* Section 3: Compound Cascading Risk Indicators */}
                    {isCompound && (
                      <div style={{ marginTop: 8, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 4, padding: "6px 8px" }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#991b1b", display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="pulse-danger-dot" />
                          <span>🚨 ACTIVE COMPOUND CASCADE: {data.compound_pathway}</span>
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#991b1b", marginTop: 2, lineHeight: 1.35 }}>
                          Debris damming potential high. Upstream impoundment surge risk imminent along {data.roadName}.
                        </div>
                      </div>
                    )}

                    {/* Critical Action Banner */}
                    {data.roadBlocked && (
                      <div className="sim-road-blocked-alert">
                        <strong>🚨 HIGHWAY CORRIDOR SEVERED:</strong> {data.roadName} blocked by debris or floodwaters. Immediate emergency detour required.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { SimulationWorkspace };
