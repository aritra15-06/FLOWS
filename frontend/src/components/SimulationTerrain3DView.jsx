import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ROAD_CORRIDORS, SIKKIM_SETTLEMENTS, MOCK_POPULATION } from "../data/mockPopulation";
import defaultSatelliteDem from "../data/sikkim_satellite_dem.json";
import {
  BBOX,
  PLANE_SIZE,
  geoTo3D,
  threeToGeo,
  sampleSatelliteElevation,
  dist2D,
  distToPolyline,
  processLiveWaterways,
  buildLiveRiverMeshes,
  getRiverHalfWidth,
  buildValleySpatialIndex,
  carveValleyElevation,
} from "../utils/river3DBuilder";
import {
  calculatePointSeverity,
  renderDynamicHazardHeatmap,
} from "../utils/dynamicHeatmapBuilder";

const SATELLITE_API_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=88.35,27.10,88.85,27.75&bboxSR=4326&imageSR=4326&size=1024,1024&f=image";

const SEGS = 72; // Terrain mesh resolution (73x73 = 5,329 vertices)

function getSiteDisplayColor(data) {
  if (!data) return "#16a34a";
  const sevBand = data.severity_band || "MINOR";
  const stability = data.stability_state || "STABLE";
  const riverStage = data.river_stage_state || "NORMAL";
  const fos = data.factor_of_safety;
  const isCompound = data.compound_active;
  const prob = data.probability_percent || 0;
  const flProb = data.flood_probability_percent || 0;

  if (
    isCompound ||
    sevBand === "CATASTROPHIC_POTENTIAL" ||
    stability === "UNSTABLE" ||
    riverStage === "CATASTROPHIC_SURGE" ||
    (fos != null && fos < 1.0) ||
    prob >= 75 ||
    flProb >= 75
  ) {
    return "#dc2626";
  }
  if (
    sevBand === "MAJOR" ||
    stability === "MARGINAL" ||
    riverStage === "OVERBANK_FLOODING" ||
    (fos != null && fos < 1.3) ||
    prob >= 50 ||
    flProb >= 50
  ) {
    return "#ea580c";
  }
  if (
    sevBand === "MODERATE" ||
    riverStage === "BANKFULL_WARNING" ||
    (fos != null && fos < 1.5) ||
    prob >= 25 ||
    flProb >= 25
  ) {
    return "#d97706";
  }
  return "#16a34a";
}

function createProceduralSatelliteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, "#1c301a");
  grad.addColorStop(0.3, "#2a4224");
  grad.addColorStop(0.5, "#41522d");
  grad.addColorStop(0.7, "#243b22");
  grad.addColorStop(1, "#1b2c19");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i] + n * 1.2));
    data[i + 2] = Math.min(255, Math.max(0, data[i] + n * 0.8));
  }
  ctx.putImageData(imgData, 0, 0);

  const snowGrad = ctx.createRadialGradient(90, 60, 5, 90, 60, 75);
  snowGrad.addColorStop(0, "rgba(245, 248, 252, 0.9)");
  snowGrad.addColorStop(0.6, "rgba(215, 230, 245, 0.5)");
  snowGrad.addColorStop(1, "transparent");
  ctx.fillStyle = snowGrad;
  ctx.beginPath();
  ctx.arc(90, 60, 75, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createFlowingWaterTexture(isFlood = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  if (!isFlood) {
    // Pristine Himalayan glacial turquoise water gradient
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "#0369a1");
    grad.addColorStop(0.2, "#0284c7");
    grad.addColorStop(0.5, "#38bdf8");
    grad.addColorStop(0.8, "#0284c7");
    grad.addColorStop(1, "#0369a1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1024);

    // Flowing current streaks and rapids foam
    ctx.fillStyle = "rgba(224, 242, 254, 0.35)";
    for (let y = 0; y < 1024; y += 18) {
      const w = 40 + Math.random() * 85;
      const x = 50 + Math.random() * 110;
      const h = 4 + Math.random() * 8;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Thin rapid wave highlights
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 1.8;
    for (let y = 10; y < 1024; y += 28) {
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.quadraticCurveTo(128, y + (Math.random() - 0.5) * 20, 206, y);
      ctx.stroke();
    }
  } else {
    // Churning turbulent flash flood torrent with mud/debris crimson red
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "#7f1d1d");
    grad.addColorStop(0.2, "#991b1b");
    grad.addColorStop(0.5, "#ef4444");
    grad.addColorStop(0.8, "#dc2626");
    grad.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1024);

    // Churning muddy torrent foam and surge ripples
    ctx.fillStyle = "rgba(254, 202, 202, 0.55)";
    for (let y = 0; y < 1024; y += 14) {
      const w = 55 + Math.random() * 110;
      const x = 40 + Math.random() * 130;
      const h = 5 + Math.random() * 10;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Violent surging rapids crests
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2.5;
    for (let y = 8; y < 1024; y += 22) {
      ctx.beginPath();
      ctx.moveTo(35, y);
      ctx.quadraticCurveTo(128, y + (Math.random() - 0.5) * 28, 221, y);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

/**
 * Checks whether an individual river reach is experiencing localized rainfall and flash flood risk.
 * A reach only turns RED when there is an active flood surge (OVERBANK_FLOODING / CATASTROPHIC_SURGE)
 * or severe flash flood conditions (flood probability >= 60% under active cloudburst downpour).
 * Under nominal conditions (Day 1 / dry weather / normal flow), rivers remain natural pristine blue.
 */
function checkRiverFlooding(rMesh, sites) {
  if (!sites || !rMesh) return false;
  const nearLocId = rMesh.userData?.nearLocationId;
  const pts = rMesh.userData?.points || [];

  const isStationFlooding = (s) => {
    if (!s) return false;
    const stage = s.river_stage_state;
    // Direct overbank surge or dam burst surge
    if (stage === "OVERBANK_FLOODING" || stage === "CATASTROPHIC_SURGE") {
      return true;
    }
    const floodProb = s.flood_probability_percent ?? 0;
    const r1 = Number(s.rainfall_1h_mm ?? s.current_params?.rainfall_1h_mm ?? 0);
    const r24 = Number(s.rainfall_24h_mm ?? s.current_params?.rainfall_24h_mm ?? 0);
    // Severe flash flood risk under active storm downpour
    if (floodProb >= 60 && (r1 >= 15.0 || r24 >= 70.0)) {
      return true;
    }
    if (s.compound_active && s.compound_pathway === "LND_DAM_BURST_SURGE" && floodProb >= 50) {
      return true;
    }
    return false;
  };

  // 1. Direct site check if waterway belongs to a monitored station
  if (nearLocId && sites[nearLocId]) {
    if (isStationFlooding(sites[nearLocId])) {
      return true;
    }
  }

  // 2. Spatial proximity check: if river passes within catchment of any station experiencing active flood surge
  for (const s of Object.values(sites)) {
    if (!isStationFlooding(s)) continue;

    const sLat = Number(s.latitude ?? s.lat ?? s.current_params?.latitude);
    const sLng = Number(s.longitude ?? s.lon ?? s.lng ?? s.current_params?.longitude);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) continue;

    for (let i = 0; i < pts.length; i += 2) {
      const pt = pts[i];
      const pLat = pt.lat;
      const pLng = pt.lng;
      if (!pLat || !pLng) continue;
      const dLat = (pLat - sLat) * 111.32;
      const dLng = (pLng - sLng) * 111.32 * Math.cos((sLat * Math.PI) / 180);
      const distKm = Math.hypot(dLat, dLng);
      if (distKm <= 6.0) {
        return true;
      }
    }
  }

  return false;
}



export default function SimulationTerrain3DView({
  sites = {},
  selectedSite,
  onSelectSite,
  showPeople = true,
  showInfrastructure = true,
  hazardMode = "compound",
  setHazardMode,
  isPickingLocation = false,
  setIsPickingLocation,
  onMapClick,
  customSites = [],
  onClearCustomSites,
  viewDimension,
  setViewDimension,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const geoRef = useRef(null);
  const baseHeightsRef = useRef([]);
  const materialsRef = useRef({});
  const markersRef = useRef([]);
  const cloudObjectsRef = useRef([]);
  const floodSurgeMeshesRef = useRef([]);
  const riverGroupRef = useRef(null);
  const normalWaterTexRef = useRef(null);
  const floodWaterTexRef = useRef(null);
  const normalWaterMatRef = useRef(null);
  const floodWaterMatRef = useRef(null);
  const hazardCanvasRef = useRef(null);
  const hazardTextureRef = useRef(null);

  // Synchronized callback refs to eliminate stale closure bugs
  const isPickingLocationRef = useRef(isPickingLocation);
  useEffect(() => { isPickingLocationRef.current = isPickingLocation; }, [isPickingLocation]);

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  const onSelectSiteRef = useRef(onSelectSite);
  useEffect(() => { onSelectSiteRef.current = onSelectSite; }, [onSelectSite]);

  const setIsPickingLocationRef = useRef(setIsPickingLocation);
  useEffect(() => { setIsPickingLocationRef.current = setIsPickingLocation; }, [setIsPickingLocation]);

  // View state
  const [textureMode, setTextureMode] = useState("hazard"); // "hazard" (default continuous risk raster) | "satellite" | "topo"
  const inspectedCoordsRef = useRef(null);
  const [vertExaggeration, setVertExaggeration] = useState(1.4);
  const vertExaggerationRef = useRef(vertExaggeration);
  useEffect(() => { vertExaggerationRef.current = vertExaggeration; }, [vertExaggeration]);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  const [flowSpeed, setFlowSpeed] = useState(1.0);
  const flowSpeedRef = useRef(flowSpeed);
  useEffect(() => { flowSpeedRef.current = flowSpeed; }, [flowSpeed]);

  const [satStatus, setSatStatus] = useState("loading");
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [inspectedPoint, setInspectedPoint] = useState(null);
  const [satelliteData, setSatelliteData] = useState(defaultSatelliteDem);
  const [liveWaterways, setLiveWaterways] = useState([]);

  const hasActiveFloodSurge = Object.values(sites).some(
    (s) => s?.river_stage_state === "OVERBANK_FLOODING" || s?.river_stage_state === "CATASTROPHIC_SURGE"
  );

  // 1. Ingest Live Satellite Elevation Data from Backend
  useEffect(() => {
    let isSubscribed = true;
    async function loadLiveSatelliteData() {
      try {
        setSatStatus("loading");
        const res = await fetch("/api/terrain/live");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isSubscribed && data && data.elevations && data.elevations.length > 0) {
          setSatelliteData(data);
          setSatStatus(data.is_live ? "live" : "cached");
          if (data.waterways && data.waterways.length > 0) {
            setLiveWaterways(data.waterways);
          }
        }
      } catch (err) {
        console.info("Using cached satellite observation for 3D terrain simulation", err);
        if (isSubscribed) setSatStatus("cached");
      }
    }
    loadLiveSatelliteData();
    return () => { isSubscribed = false; };
  }, []);

  // 1b. Ingest Live OpenStreetMap Drainage Waterways from Backend
  useEffect(() => {
    let isSubscribed = true;
    async function loadWaterways() {
      try {
        const res = await fetch("/api/waterways/live");
        if (res.ok) {
          const data = await res.json();
          if (isSubscribed && data && data.waterways && data.waterways.length > 0) {
            setLiveWaterways(data.waterways);
          }
        }
      } catch (err) {
        console.warn("Notice: Live waterways loading note:", err);
      }
    }
    loadWaterways();
    return () => { isSubscribed = false; };
  }, []);

  // 2. Setup Three.js 3D Scene
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || 600, H = el.clientHeight || 450;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.005);

    const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 950);
    camera.position.set(0, 55, 80);
    camera.lookAt(0, 8, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.zIndex = "1";
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.95);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.45);
    sun.position.set(45, 95, 35);
    sun.castShadow = true;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.5);
    fillLight.position.set(-45, 50, -35);
    scene.add(fillLight);

    // Terrain Geometry
    const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    geoRef.current = geo;

    const pos = geo.attributes.position;
    const count = pos.count;
    const baseHeights = new Float32Array(count);
    const topoColors = new Float32Array(count * 3);

    const elevations = satelliteData.elevations || defaultSatelliteDem.elevations;
    const gridSize = satelliteData.grid_size || defaultSatelliteDem.grid_size || 25;
    const minElev = satelliteData.min_elevation || 262;
    const maxElev = satelliteData.max_elevation || 5473;

    // Process all live OSM waterways from OpenStreetMap
    const activeWaterways = (liveWaterways && liveWaterways.length > 0)
      ? liveWaterways
      : (satelliteData.waterways || defaultSatelliteDem.waterways || []);

    const processedRivers = processLiveWaterways(
      activeWaterways,
      elevations,
      gridSize,
      minElev,
      maxElev
    );

    // Build spatial hash index for realistic flat riverbed & floodplain valley carving
    const valleyIndex = buildValleySpatialIndex(processedRivers);

    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const normX = (vx + PLANE_SIZE / 2) / PLANE_SIZE;
      const normZ = (vz + PLANE_SIZE / 2) / PLANE_SIZE;

      const { hMeters, yWorld } = sampleSatelliteElevation(
        normX, normZ, elevations, gridSize, minElev, maxElev
      );

      // Hydrologically flatten the riverbed and alluvial valley floor along live rivers
      const carvedY = carveValleyElevation(vx, vz, yWorld, valleyIndex);

      baseHeights[i] = carvedY;
      pos.setY(i, carvedY * vertExaggeration);

      let r, g, b;
      if (hMeters < 600) { r = 0.22; g = 0.62; b = 0.36; }
      else if (hMeters < 1500) { r = 0.28; g = 0.54; b = 0.26; }
      else if (hMeters < 2800) { r = 0.56; g = 0.46; b = 0.28; }
      else if (hMeters < 4000) { r = 0.54; g = 0.53; b = 0.54; }
      else { r = 0.94; g = 0.96; b = 0.99; }
      topoColors[i * 3] = r;
      topoColors[i * 3 + 1] = g;
      topoColors[i * 3 + 2] = b;
    }

    baseHeightsRef.current = baseHeights;
    geo.setAttribute("color", new THREE.BufferAttribute(topoColors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    const fallbackSatTexture = createProceduralSatelliteTexture();
    const satMaterial = new THREE.MeshStandardMaterial({
      map: fallbackSatTexture,
      roughness: 0.82,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const topoMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const hazardCanvas = document.createElement("canvas");
    hazardCanvas.width = 128;
    hazardCanvas.height = 128;
    hazardCanvasRef.current = hazardCanvas;

    const allInitialSites = { ...sites };
    if (customSites && customSites.length > 0) {
      customSites.forEach((cs) => { allInitialSites[cs.id] = cs; });
    }
    renderDynamicHazardHeatmap(hazardCanvas, allInitialSites, satelliteData, liveWaterways, hazardMode);

    const hazardTexture = new THREE.CanvasTexture(hazardCanvas);
    hazardTexture.minFilter = THREE.LinearFilter;
    hazardTexture.magFilter = THREE.LinearFilter;
    hazardTexture.colorSpace = THREE.SRGBColorSpace;
    hazardTextureRef.current = hazardTexture;

    const hazardMaterial = new THREE.MeshStandardMaterial({
      map: hazardTexture,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    materialsRef.current = {
      satellite: satMaterial,
      topo: topoMaterial,
      hazard: hazardMaterial,
    };

    const initialMat = textureMode === "hazard" ? hazardMaterial : (textureMode === "topo" ? topoMaterial : satMaterial);
    const terrainMesh = new THREE.Mesh(geo, initialMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);
    meshRef.current = terrainMesh;

    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.16 });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.visible = false;
    scene.add(wireMesh);

    const normalWaterTex = createFlowingWaterTexture(false);
    normalWaterTex.colorSpace = THREE.SRGBColorSpace;
    const floodWaterTex = createFlowingWaterTexture(true);
    floodWaterTex.colorSpace = THREE.SRGBColorSpace;
    normalWaterTexRef.current = normalWaterTex;
    floodWaterTexRef.current = floodWaterTex;

    const normalWaterMat = new THREE.MeshStandardMaterial({
      map: normalWaterTex,
      transparent: true,
      opacity: 0.94,
      roughness: 0.18,
      metalness: 0.65,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    normalWaterMatRef.current = normalWaterMat;

    const floodWaterMat = new THREE.MeshStandardMaterial({
      map: floodWaterTex,
      transparent: true,
      opacity: 0.96,
      roughness: 0.28,
      metalness: 0.25,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    floodWaterMatRef.current = floodWaterMat;

    // Dynamically build 3D ribbon geometries for all live OSM rivers & tributaries
    const { riverGroup } = buildLiveRiverMeshes(
      processedRivers,
      vertExaggeration,
      normalWaterTex,
      THREE
    );
    scene.add(riverGroup);
    riverGroupRef.current = riverGroup;

    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin("anonymous");
    texLoader.load(
      SATELLITE_API_URL,
      (liveTex) => {
        liveTex.wrapS = THREE.ClampToEdgeWrapping;
        liveTex.wrapT = THREE.ClampToEdgeWrapping;
        liveTex.colorSpace = THREE.SRGBColorSpace;
        satMaterial.map = liveTex;
        satMaterial.needsUpdate = true;
      },
      undefined,
      (err) => console.info("ArcGIS satellite texture note:", err)
    );

    // Highway Corridors in 3D
    if (showInfrastructure) {
      ROAD_CORRIDORS.forEach((road) => {
        const rPts = road.points || [];
        if (rPts.length < 2) return;
        const pts3D = rPts.map(([lat, lng]) => {
          const { x, z, normX, normZ } = geoTo3D(lat, lng);
          const { yWorld } = sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev);
          return new THREE.Vector3(x, yWorld * vertExaggeration + 0.15, z);
        });
        const roadGeo = new THREE.BufferGeometry().setFromPoints(pts3D);
        const nearSite = sites[road.nearLocationId];
        const isBlocked = nearSite?.roadBlocked || (nearSite?.factor_of_safety != null && nearSite.factor_of_safety < 1.0);
        const roadMat = new THREE.LineBasicMaterial({
          color: isBlocked ? 0xdc2626 : 0x334155,
          linewidth: isBlocked ? 3 : 2,
        });
        const roadLine = new THREE.Line(roadGeo, roadMat);
        scene.add(roadLine);
      });
    }

    // Settlements in 3D
    if (showInfrastructure) {
      SIKKIM_SETTLEMENTS.forEach((town) => {
        const { x, z, normX, normZ } = geoTo3D(town.latitude, town.longitude);
        const { yWorld } = sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev);
        const townGroup = new THREE.Group();
        const townGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const townMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });
        const townMesh = new THREE.Mesh(townGeo, townMat);
        townMesh.position.y = 0.45;
        townGroup.add(townMesh);
        townGroup.position.set(x, yWorld * vertExaggeration, z);
        townGroup.userData = { town, type: "settlement" };
        scene.add(townGroup);
      });
    }

    // Citizens in 3D
    if (showPeople) {
      MOCK_POPULATION.slice(0, 15).forEach((citizen) => {
        const { x, z, normX, normZ } = geoTo3D(citizen.latitude, citizen.longitude);
        const { yWorld } = sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev);
        const personGroup = new THREE.Group();
        const bodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.7;
        const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
        const headMesh = new THREE.Mesh(headGeo, bodyMat);
        headMesh.position.y = 1.6;
        personGroup.add(bodyMesh);
        personGroup.add(headMesh);
        personGroup.position.set(x, yWorld * vertExaggeration, z);
        personGroup.userData = { citizen, type: "citizen" };
        scene.add(personGroup);
      });
    }

    // Raycaster for Clicking and Hovering
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      if (isPickingLocationRef.current) {
        renderer.domElement.style.cursor = "crosshair";
        return;
      }

      const hitCandidates = markersRef.current.map((g) => g.userData.headMesh).filter(Boolean);
      const hits = raycaster.intersectObjects(hitCandidates);
      if (hits.length > 0) {
        const hitGroup = hits[0].object.parent;
        setHoveredInfo(hitGroup.userData.siteData);
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHoveredInfo(null);
        renderer.domElement.style.cursor = "grab";
      }
    };

    let mouseDownPos = { x: 0, y: 0 };
    const onClick = (e) => {
      // Check if mouse moved during press (ignore drag events as clicks)
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      const maxDist = isPickingLocationRef.current ? 18 : 8;
      if (dist > maxDist) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Handle custom site dropping
      if (isPickingLocationRef.current && onMapClickRef.current) {
        const candidateMeshes = [
          meshRef.current,
          ...(riverGroupRef.current ? riverGroupRef.current.children : []),
        ].filter(Boolean);
        let hits = raycaster.intersectObjects(candidateMeshes, false);
        let hitPoint = null;

        if (hits.length > 0) {
          hitPoint = hits[0].point;
        } else {
          // Fallback: intersect with ground horizontal plane at y = 0
          const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
          const target = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, target)) {
            if (Math.abs(target.x) <= PLANE_SIZE / 2 && Math.abs(target.z) <= PLANE_SIZE / 2) {
              hitPoint = target;
            }
          }
        }

        if (hitPoint) {
          const { lat, lng } = threeToGeo(hitPoint.x, hitPoint.z);
          const clampedLat = Math.max(BBOX.minLat + 0.01, Math.min(BBOX.maxLat - 0.01, lat));
          const clampedLng = Math.max(BBOX.minLng + 0.01, Math.min(BBOX.maxLng - 0.01, lng));
          const allCurrentSites = { ...sites };
          if (customSites && customSites.length > 0) {
            customSites.forEach((cs) => { allCurrentSites[cs.id] = cs; });
          }
          const pointSev = calculatePointSeverity(
            clampedLat,
            clampedLng,
            allCurrentSites,
            satelliteData,
            liveWaterways,
            hazardMode
          );
          inspectedCoordsRef.current = { lat: clampedLat, lng: clampedLng, name: "Custom Point (Active Telemetry)" };
          setInspectedPoint({ ...pointSev, name: "Custom Point (Active Telemetry)" });
          onMapClickRef.current(clampedLat, clampedLng);
          if (setIsPickingLocationRef.current) setIsPickingLocationRef.current(false);
          return;
        }
      }

      // Handle selecting existing site pin
      const hitCandidates = markersRef.current.map((g) => g.userData.headMesh).filter(Boolean);
      const hits = raycaster.intersectObjects(hitCandidates);
      if (hits.length > 0) {
        const hitGroup = hits[0].object.parent;
        if (onSelectSiteRef.current && hitGroup.userData.siteId) {
          onSelectSiteRef.current(hitGroup.userData.siteId);
          setInspectedPoint(null);
          inspectedCoordsRef.current = null;
        }
        return;
      }

      // Handle inspecting any clicked location directly on the terrain mesh / heatmap
      if (meshRef.current) {
        const terrainHits = raycaster.intersectObject(meshRef.current, false);
        if (terrainHits.length > 0) {
          const hit = terrainHits[0].point;
          const { lat, lng } = threeToGeo(hit.x, hit.z);
          if (
            lat >= BBOX.minLat &&
            lat <= BBOX.maxLat &&
            lng >= BBOX.minLng &&
            lng <= BBOX.maxLng
          ) {
            const allCurrentSites = { ...sites };
            if (customSites && customSites.length > 0) {
              customSites.forEach((cs) => { allCurrentSites[cs.id] = cs; });
            }
            const pointSev = calculatePointSeverity(
              lat,
              lng,
              allCurrentSites,
              satelliteData,
              liveWaterways,
              hazardMode
            );
            const locationLabel = pointSev.nearestSiteName ? `Terrain Spot (${pointSev.nearestSiteName})` : "Inspected Mountain Sector";
            inspectedCoordsRef.current = { lat, lng, name: locationLabel };
            setInspectedPoint({ ...pointSev, name: locationLabel });
          }
        }
      }
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("click", onClick);

    // Orbit Controls
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let theta = 0.28;
    let phi = 0.52;
    let radius = 80;

    const onMouseDown = (e) => {
      isDragging = true;
      mouseDownPos = { x: e.clientX, y: e.clientY };
      prevMouse = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = isPickingLocationRef.current ? "crosshair" : "grabbing";
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      theta -= (e.clientX - prevMouse.x) * 0.007;
      phi = Math.max(0.12, Math.min(1.35, phi - (e.clientY - prevMouse.y) * 0.005));
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = isPickingLocationRef.current ? "crosshair" : "grab";
    };
    const onWheel = (e) => {
      e.preventDefault();
      radius = Math.max(28, Math.min(150, radius + e.deltaY * 0.06));
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Animation Loop
    let clock = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      clock += 0.016;

      if (autoRotateRef.current && !isDragging) {
        theta += 0.0018;
      }

      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = Math.max(12, radius * Math.sin(phi) + 12);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 8, 0);

      const currentFlow = flowSpeedRef.current;
      if (normalWaterTexRef.current) {
        normalWaterTexRef.current.offset.y -= 0.0045 * currentFlow;
      }
      if (floodWaterTexRef.current) {
        floodWaterTexRef.current.offset.y -= 0.009 * currentFlow; // Rapid torrential flash flood flow
      }

      // Animate flowing ripples across all live OSM river meshes
      if (riverGroupRef.current) {
        riverGroupRef.current.children.forEach((rMesh, meshIdx) => {
          if (!rMesh.geometry) return;
          const rPos = rMesh.geometry.attributes.position;
          const bY = rMesh.userData?.baseY;
          if (rPos && bY) {
            for (let k = 0; k < rPos.count; k++) {
              const ripple = Math.sin(clock * 5.5 + k * 0.35 + meshIdx) * 0.05 * currentFlow;
              rPos.setY(k, bY[k] * vertExaggerationRef.current + ripple);
            }
            rPos.needsUpdate = true;
          }
        });
      }

      // Animate 3D Raining Clouds
      if (cloudObjectsRef.current.length > 0) {
        cloudObjectsRef.current.forEach((cObj) => {
          cObj.cloudGroup.position.y = cObj.baseY + Math.sin(clock * 2.0 + cObj.seed) * 0.35;

          if (cObj.rainGeo) {
            const rPositions = cObj.rainGeo.attributes.position.array;
            for (let pIdx = 0; pIdx < rPositions.length / 3; pIdx++) {
              rPositions[pIdx * 3 + 1] -= cObj.rainSpeed * 0.016;
              if (rPositions[pIdx * 3 + 1] < cObj.groundY) {
                rPositions[pIdx * 3 + 1] = cObj.baseY - 1.5;
              }
            }
            cObj.rainGeo.attributes.position.needsUpdate = true;
          }

          if (cObj.lightningLight && cObj.isHeavyStorm) {
            if (Math.random() < 0.035) {
              cObj.lightningLight.intensity = 3.5 + Math.random() * 2.0;
            } else {
              cObj.lightningLight.intensity = THREE.MathUtils.lerp(cObj.lightningLight.intensity, 0, 0.25);
            }
          }
        });
      }

      // Animate 3D Flood Inundation Surge Volumes
      if (floodSurgeMeshesRef.current.length > 0) {
        floodSurgeMeshesRef.current.forEach((fMesh) => {
          const pulse = 1.0 + Math.sin(clock * 4.0 + fMesh.userData.seed) * 0.15;
          fMesh.scale.set(pulse, 1.0, pulse);
          if (fMesh.material) {
            fMesh.material.opacity = 0.55 + Math.sin(clock * 3.5) * 0.15;
          }
        });
      }

      // Animate station beacon rings
      markersRef.current.forEach((pin, idx) => {
        const floatDelta = Math.sin(clock * 3.0 + idx * 1.2) * 0.35;
        pin.position.y = pin.userData.baseY + floatDelta;
        if (pin.userData.ringMesh) {
          const ringScale = 1.0 + Math.sin(clock * 4.0 + idx) * 0.25;
          pin.userData.ringMesh.scale.set(ringScale, ringScale, ringScale);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!el || !rendererRef.current) return;
      const nW = el.clientWidth;
      const nH = el.clientHeight;
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(nW, nH);
    };
    window.addEventListener("resize", onResize);

    meshRef.current._wireMesh = wireMesh;

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      if (riverGroupRef.current) {
        riverGroupRef.current.children.forEach((mesh) => {
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) mesh.material.dispose();
        });
        scene.remove(riverGroupRef.current);
      }
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [satelliteData, liveWaterways, showInfrastructure, showPeople]);

  // 3. Rebuild 3D Site Pins, Clouds, and Flood Inundations when Simulation State Updates
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    markersRef.current.forEach((m) => scene.remove(m));
    markersRef.current = [];

    cloudObjectsRef.current.forEach((c) => {
      scene.remove(c.cloudGroup);
      if (c.rainPoints) scene.remove(c.rainPoints);
    });
    cloudObjectsRef.current = [];

    floodSurgeMeshesRef.current.forEach((f) => scene.remove(f));
    floodSurgeMeshesRef.current = [];

    const elevations = satelliteData.elevations || defaultSatelliteDem.elevations;
    const gridSize = satelliteData.grid_size || defaultSatelliteDem.grid_size || 25;
    const minElev = satelliteData.min_elevation || 262;
    const maxElev = satelliteData.max_elevation || 5473;



    const allSitesMap = { ...sites };
    customSites.forEach((cs) => { allSitesMap[cs.id] = cs; });

    // Localized River Flash Flood Color Updating:
    // Individual river reaches turn RED when rainfall and flash flood occur in their catchment
    if (riverGroupRef.current && normalWaterMatRef.current && floodWaterMatRef.current) {
      riverGroupRef.current.children.forEach((rMesh) => {
        const isFlooding = checkRiverFlooding(rMesh, allSitesMap);
        const targetMat = isFlooding ? floodWaterMatRef.current : normalWaterMatRef.current;
        if (rMesh.material !== targetMat) {
          rMesh.material = targetMat;
          rMesh.material.needsUpdate = true;
        }
      });
    }

    Object.entries(allSitesMap).forEach(([siteId, data], idx) => {
      const params = data?.current_params || data;
      const lat = Number(params?.latitude ?? params?.lat);
      const lng = Number(params?.longitude ?? params?.lon ?? params?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const { x, z, normX, normZ } = geoTo3D(lat, lng);
      const { hMeters, yWorld } = sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev);
      const siteAltitude = yWorld * vertExaggeration;

      const isSelected = selectedSite === siteId;
      const colorHex = new THREE.Color(getSiteDisplayColor(data));

      const pinGroup = new THREE.Group();
      const pinScale = isSelected ? 1.35 : 1.0;

      const headGeo = new THREE.SphereGeometry(1.6 * pinScale, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.y = 4.2 * pinScale;

      const stemGeo = new THREE.ConeGeometry(0.7 * pinScale, 4.2 * pinScale, 8);
      stemGeo.rotateX(Math.PI);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = 2.1 * pinScale;

      const ringGeo = new THREE.RingGeometry(1.2 * pinScale, 2.2 * pinScale, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.1;

      pinGroup.add(headMesh);
      pinGroup.add(stemMesh);
      pinGroup.add(ringMesh);
      pinGroup.position.set(x, siteAltitude, z);

      pinGroup.userData = {
        siteId,
        siteData: data,
        headMesh,
        ringMesh,
        baseY: siteAltitude,
        satelliteElevation: Math.round(hMeters),
      };

      scene.add(pinGroup);
      markersRef.current.push(pinGroup);

      // ── 3D CLOUD RAINING ANIMATION ──
      const rain1h = data?.rainfall_1h_mm ?? params?.rainfall_1h_mm ?? 0;
      const rain24h = data?.rainfall_24h_mm ?? params?.rainfall_24h_mm ?? 0;
      const isRaining = rain1h >= 5.0 || rain24h >= 40.0;
      const isHeavyStorm = rain1h >= 16.0 || rain24h >= 100.0;

      if (isRaining) {
        const cloudGroup = new THREE.Group();
        const cloudAltitude = siteAltitude + 12.0;

        const cloudMat = new THREE.MeshStandardMaterial({
          color: isHeavyStorm ? 0x1e293b : 0x475569,
          roughness: 0.85,
          metalness: 0.05,
        });

        const puff1 = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 12), cloudMat);
        const puff2 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 10), cloudMat);
        puff2.position.set(2.4, 0.4, 0.5);
        const puff3 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 10), cloudMat);
        puff3.position.set(-2.2, 0.2, -0.4);
        const puff4 = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 10), cloudMat);
        puff4.position.set(0.6, 1.4, -0.6);

        cloudGroup.add(puff1);
        cloudGroup.add(puff2);
        cloudGroup.add(puff3);
        cloudGroup.add(puff4);
        cloudGroup.position.set(x, cloudAltitude, z);
        scene.add(cloudGroup);

        const rainCount = isHeavyStorm ? 300 : 160;
        const rainGeo = new THREE.BufferGeometry();
        const rainVerts = new Float32Array(rainCount * 3);
        for (let rIdx = 0; rIdx < rainCount; rIdx++) {
          rainVerts[rIdx * 3] = x + (Math.random() - 0.5) * 8.0;
          rainVerts[rIdx * 3 + 1] = siteAltitude + Math.random() * 11.5;
          rainVerts[rIdx * 3 + 2] = z + (Math.random() - 0.5) * 8.0;
        }
        rainGeo.setAttribute("position", new THREE.BufferAttribute(rainVerts, 3));
        const rainMat = new THREE.PointsMaterial({
          color: 0x93c5fd,
          size: 0.45,
          transparent: true,
          opacity: 0.75,
        });
        const rainPoints = new THREE.Points(rainGeo, rainMat);
        scene.add(rainPoints);

        let lightningLight = null;
        if (isHeavyStorm) {
          lightningLight = new THREE.PointLight(0xfef08a, 0, 30);
          lightningLight.position.set(x, cloudAltitude - 1.0, z);
          scene.add(lightningLight);
        }

        cloudObjectsRef.current.push({
          cloudGroup,
          rainPoints,
          rainGeo,
          groundY: siteAltitude,
          baseY: cloudAltitude,
          rainSpeed: isHeavyStorm ? 48.0 : 32.0,
          seed: idx * 1.5,
          isHeavyStorm,
          lightningLight,
        });
      }

      // ── 3D FLOOD INUNDATION ANIMATION ──
      const isOverbank =
        data?.river_stage_state === "OVERBANK_FLOODING" ||
        data?.river_stage_state === "CATASTROPHIC_SURGE";

      if (isOverbank) {
        const floodGeo = new THREE.CircleGeometry(4.8, 24);
        floodGeo.rotateX(-Math.PI / 2);
        const floodMat = new THREE.MeshBasicMaterial({
          color: 0x0284c7, // Realistic flood surge water blue
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
        });
        const floodMesh = new THREE.Mesh(floodGeo, floodMat);
        floodMesh.position.set(x, siteAltitude + 0.15, z);
        floodMesh.userData = { seed: idx * 2.0 };
        scene.add(floodMesh);
        floodSurgeMeshesRef.current.push(floodMesh);
      }
    });
  }, [sites, customSites, selectedSite, vertExaggeration, satelliteData]);

  // 3b. Dynamic Continuous Hazard Heatmap Synchronizer
  // Re-evaluates thermal risk raster across all of Sikkim whenever simulation advances,
  // weather front shifts, or custom observation nodes are dropped
  useEffect(() => {
    if (hazardCanvasRef.current && hazardTextureRef.current) {
      const allCurrentSites = { ...sites };
      if (customSites && customSites.length > 0) {
        customSites.forEach((cs) => { allCurrentSites[cs.id] = cs; });
      }
      renderDynamicHazardHeatmap(
        hazardCanvasRef.current,
        allCurrentSites,
        satelliteData,
        liveWaterways,
        hazardMode
      );
      hazardTextureRef.current.needsUpdate = true;
      if (meshRef.current?.material) {
        meshRef.current.material.needsUpdate = true;
      }
    }
  }, [sites, customSites, satelliteData, liveWaterways, hazardMode, textureMode]);

  // 3c. Dynamic Re-evaluation of Inspected Terrain Coordinate when Weather/Timeline Shifts
  useEffect(() => {
    if (inspectedCoordsRef.current) {
      const { lat, lng, name } = inspectedCoordsRef.current;
      const allCurrentSites = { ...sites };
      if (customSites && customSites.length > 0) {
        customSites.forEach((cs) => { allCurrentSites[cs.id] = cs; });
      }
      const updated = calculatePointSeverity(
        lat,
        lng,
        allCurrentSites,
        satelliteData,
        liveWaterways,
        hazardMode
      );
      setInspectedPoint((prev) => ({
        ...prev,
        ...updated,
        name: name || prev?.name || "Active Telemetry Region",
      }));
    }
  }, [sites, customSites, satelliteData, liveWaterways, hazardMode]);

  // Update Material on mode change
  useEffect(() => {
    if (!meshRef.current || !materialsRef.current) return;
    const targetMat = materialsRef.current[textureMode];
    if (targetMat) {
      meshRef.current.material = targetMat;
      meshRef.current.material.needsUpdate = true;
    }
  }, [textureMode]);

  // Update Vertical Relief Exaggeration
  useEffect(() => {
    if (!geoRef.current || !baseHeightsRef.current.length) return;
    const geo = geoRef.current;
    const pos = geo.attributes.position;
    const baseH = baseHeightsRef.current;

    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, baseH[i] * vertExaggeration);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    if (riverGroupRef.current) {
      riverGroupRef.current.children.forEach((rMesh) => {
        const rPos = rMesh.geometry?.attributes?.position;
        const bY = rMesh.userData?.baseY;
        if (rPos && bY) {
          for (let k = 0; k < rPos.count; k++) {
            rPos.setY(k, bY[k] * vertExaggeration);
          }
          rPos.needsUpdate = true;
        }
      });
    }

    if (markersRef.current) {
      markersRef.current.forEach((pin) => {
        if (pin.userData && pin.userData.baseY) {
          const scaledY = pin.userData.baseY * (vertExaggeration / 1.4);
          pin.position.y = scaledY;
        }
      });
    }
  }, [vertExaggeration]);

  // Update Wireframe
  useEffect(() => {
    if (meshRef.current?._wireMesh) {
      meshRef.current._wireMesh.visible = showWireframe;
    }
  }, [showWireframe]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#f1f5f9",
        overflow: "hidden",
      }}
    >
      {/* ── Top Bar Controls ── */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(8px)",
          padding: "7px 12px",
          borderRadius: 8,
          border: "1px solid #cbd5e1",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
          zIndex: 100,
        }}
      >
        {/* Left: Texture Selector & Hazard Mode Option Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
            3D Terrain:
          </span>
          <button
            onClick={() => setTextureMode("satellite")}
            style={{
              padding: "4px 9px",
              fontSize: "0.75rem",
              fontWeight: 700,
              borderRadius: 5,
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
              padding: "4px 9px",
              fontSize: "0.75rem",
              fontWeight: 700,
              borderRadius: 5,
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
              padding: "4px 9px",
              fontSize: "0.75rem",
              fontWeight: 700,
              borderRadius: 5,
              border: textureMode === "hazard" ? "1px solid #dc2626" : "1px solid #cbd5e1",
              background: textureMode === "hazard" ? "#dc2626" : "#ffffff",
              color: textureMode === "hazard" ? "#ffffff" : "#334155",
              cursor: "pointer",
            }}
          >
            🔥 Severity Heatmap
          </button>

          {/* 2D Map Switcher Button */}
          {setViewDimension && (
            <button
              onClick={() => setViewDimension("2d")}
              style={{
                padding: "4px 9px",
                fontSize: "0.75rem",
                fontWeight: 700,
                borderRadius: 5,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                cursor: "pointer",
              }}
              title="Switch back to 2D Leaflet interactive map"
            >
              🗺️ 2D Map View
            </button>
          )}

          {/* Location Picking Button */}
          <button
            onClick={() => setIsPickingLocation && setIsPickingLocation(!isPickingLocation)}
            style={{
              padding: "4px 9px",
              fontSize: "0.75rem",
              fontWeight: 700,
              borderRadius: 5,
              border: isPickingLocation ? "1px solid #0284c7" : "1px solid #cbd5e1",
              background: isPickingLocation ? "#0284c7" : "#ffffff",
              color: isPickingLocation ? "#ffffff" : "#334155",
              cursor: "pointer",
            }}
            title="Click anywhere on the 3D mountain surface to add a custom site"
          >
            {isPickingLocation ? "🎯 Click Terrain to Drop Pin" : "📍 + Add Custom Point"}
          </button>

          {customSites.length > 0 && (
            <button
              onClick={onClearCustomSites}
              style={{
                padding: "4px 8px",
                fontSize: "0.72rem",
                fontWeight: 700,
                borderRadius: 5,
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                color: "#dc2626",
                cursor: "pointer",
              }}
            >
              🗑️ Clear ({customSites.length})
            </button>
          )}
        </div>

        {/* Right: Sliders & Controls */}
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
              style={{ width: 65, cursor: "pointer" }}
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

      {/* ── Active River Surge Warning Banner ── */}
      {hasActiveFloodSurge && (
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 14,
            background: "rgba(15, 23, 42, 0.92)",
            color: "#38bdf8",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            padding: "5px 12px",
            borderRadius: 6,
            fontSize: "0.75rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            zIndex: 90,
          }}
        >
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#38bdf8" }} />
          🌊 LOCALIZED OVERBANK FLOODING: Elevated stage active at monitored valley stations
        </div>
      )}

      {/* ── Active Hazard Heatmap Legend & Continuous Regional Surveillance Banner ── */}
      {textureMode === "hazard" && (
        <div
          style={{
            position: "absolute",
            top: hasActiveFloodSurge ? 92 : 54,
            left: 14,
            background: "rgba(15, 23, 42, 0.94)",
            backdropFilter: "blur(10px)",
            color: "#ffffff",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: "0.72rem",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            zIndex: 90,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            pointerEvents: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, color: "#38bdf8" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#38bdf8", boxShadow: "0 0 8px #38bdf8" }} />
            <span>🌐 CONTINUOUS SIKKIM BASIN HEATMAP (100% REGIONAL SURVEILLANCE)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.68rem", color: "#cbd5e1" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, background: "#16a34a", borderRadius: 2 }} /> Safe (0-25%)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, background: "#eab308", borderRadius: 2 }} /> Advisory (25-50%)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, background: "#ea580c", borderRadius: 2 }} /> Warning (50-75%)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, background: "#dc2626", borderRadius: 2 }} /> Critical (&gt;75%)
            </span>
          </div>
        </div>
      )}

      {/* ── Localized Region Severity Inspector Card HUD ── */}
      {(inspectedPoint || (selectedSite && sites[selectedSite])) &&
        (() => {
          const activeData = inspectedPoint || sites[selectedSite];
          const isArbitraryPoint = !!inspectedPoint && !inspectedPoint.id;
          const name = activeData?.name || `Region ${selectedSite}`;
          const lat = Number(activeData?.latitude ?? activeData?.lat);
          const lng = Number(activeData?.longitude ?? activeData?.lng ?? activeData?.lon);
          const elev = activeData?.elevation_m ?? activeData?.satelliteElevation ?? 1200;
          const slope = activeData?.slope_deg ?? 32;
          const fos = activeData?.factor_of_safety;
          const lsProb = activeData?.probability_percent ?? activeData?.landslide_probability_percent ?? 15;
          const stage = activeData?.river_stage_state || "NORMAL";
          const stability = activeData?.stability_state || "STABLE";
          const sevBand = activeData?.severity_band || "MINOR";
          const rain1h = activeData?.rainfall_1h_mm ?? 0;
          const rain24h = activeData?.rainfall_24h_mm ?? 0;

          let sevTitle = "🟢 NOMINAL STABILITY: LOW HAZARD";
          let sevBg = "rgba(34, 197, 94, 0.18)";
          let sevBorder = "#22c55e";
          let sevText = "#4ade80";

          const isCritical =
            sevBand === "CATASTROPHIC_POTENTIAL" ||
            stability === "UNSTABLE" ||
            stage === "OVERBANK_FLOODING" ||
            stage === "CATASTROPHIC_SURGE" ||
            (fos != null && fos < 1.0) ||
            lsProb >= 75;

          const isMajor =
            !isCritical &&
            (sevBand === "MAJOR" ||
              stability === "MARGINAL" ||
              stage === "BANKFULL_WARNING" ||
              (fos != null && fos < 1.25) ||
              lsProb >= 48);

          const isModerate =
            !isCritical &&
            !isMajor &&
            (sevBand === "MODERATE" ||
              lsProb >= 35 ||
              (fos != null && fos < 1.35 && rain24h >= 40));

          if (isCritical) {
            sevTitle = "🚨 CRITICAL SEVERITY: FAILURE IMMINENT";
            sevBg = "rgba(220, 38, 38, 0.22)";
            sevBorder = "#ef4444";
            sevText = "#fca5a5";
          } else if (isMajor) {
            sevTitle = "⚠️ MAJOR WARNING: DEGRADED STABILITY";
            sevBg = "rgba(234, 88, 12, 0.22)";
            sevBorder = "#f97316";
            sevText = "#fdba74";
          } else if (isModerate) {
            sevTitle = "⚡ MODERATE ADVISORY: ELEVATED THREAT";
            sevBg = "rgba(234, 179, 8, 0.20)";
            sevBorder = "#eab308";
            sevText = "#fef08a";
          }

          return (
            <div
              style={{
                position: "absolute",
                top: 56,
                right: 14,
                width: 335,
                background: "rgba(15, 23, 42, 0.94)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${sevBorder}`,
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
                color: "#ffffff",
                padding: "13px 15px",
                zIndex: 105,
                fontSize: "0.78rem",
                pointerEvents: "auto",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "0.88rem",
                      color: "#f8fafc",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    📍 {name}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>
                    {Number.isFinite(lat) ? lat.toFixed(4) : "27.4200"}°N,{" "}
                    {Number.isFinite(lng) ? lng.toFixed(4) : "88.5200"}°E ·{" "}
                    {activeData.isCustom
                      ? "Custom Monitored Station"
                      : isArbitraryPoint
                      ? "Terrain Spot Inspection"
                      : "Core Teesta Station"}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setInspectedPoint(null);
                    inspectedCoordsRef.current = null;
                    if (onSelectSite) onSelectSite(null);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "none",
                    borderRadius: 4,
                    color: "#cbd5e1",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    padding: "2px 7px",
                  }}
                  title="Close Inspector"
                >
                  ✕
                </button>
              </div>

              {/* Status Badge */}
              <div
                style={{
                  background: sevBg,
                  border: `1px solid ${sevBorder}`,
                  borderRadius: 7,
                  padding: "7px 11px",
                  fontWeight: 800,
                  fontSize: "0.75rem",
                  color: sevText,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  lineHeight: 1.35,
                  boxShadow: `0 2px 10px ${sevBg}`,
                }}
              >
                <span>{sevTitle}</span>
              </div>

              {/* Key Metrics Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px 10px",
                  marginBottom: 10,
                  background: "rgba(30, 41, 59, 0.75)",
                  padding: "9px 11px",
                  borderRadius: 6,
                }}
              >
                <div>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Elevation:</span>
                  <div style={{ fontWeight: 700, color: "#f1f5f9" }}>{elev} m</div>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Slope Gradient:</span>
                  <div style={{ fontWeight: 700, color: "#f1f5f9" }}>{slope}°</div>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Factor of Safety:</span>
                  <div
                    style={{
                      fontWeight: 700,
                      color: fos < 1.0 ? "#f87171" : fos < 1.3 ? "#fb923c" : "#4ade80",
                    }}
                  >
                    {fos != null ? Number(fos).toFixed(2) : "1.45"} ({stability})
                  </div>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Landslide Risk:</span>
                  <div
                    style={{
                      fontWeight: 700,
                      color: lsProb > 60 ? "#f87171" : lsProb > 35 ? "#fb923c" : "#4ade80",
                    }}
                  >
                    {lsProb}%
                  </div>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>River Stage:</span>
                  <div
                    style={{
                      fontWeight: 700,
                      color: stage !== "NORMAL" ? "#38bdf8" : "#94a3b8",
                    }}
                  >
                    {stage}
                  </div>
                </div>
                <div>
                  <span style={{ color: "#94a3b8", fontSize: "0.68rem" }}>Rain (1h / 24h):</span>
                  <div style={{ fontWeight: 700, color: "#93c5fd" }}>
                    {Number(rain1h).toFixed(1)} / {Math.round(rain24h)} mm
                  </div>
                </div>
              </div>

              {/* Action for arbitrary inspected spot */}
              {isArbitraryPoint && onMapClick && (
                <button
                  onClick={() => {
                    onMapClick(lat, lng);
                    setInspectedPoint(null);
                  }}
                  style={{
                    width: "100%",
                    background: "#0284c7",
                    border: "none",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontWeight: 700,
                    padding: "7px 10px",
                    cursor: "pointer",
                    fontSize: "0.74rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    boxShadow: "0 2px 8px rgba(2, 132, 199, 0.35)",
                  }}
                >
                  📍 + Add Permanent Station at this Location
                </button>
              )}
            </div>
          );
        })()}

      {/* ── Location Picking Banner ── */}
      {isPickingLocation && (
        <div
          style={{
            position: "absolute",
            top: 54,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0284c7",
            color: "#ffffff",
            padding: "7px 18px",
            borderRadius: 20,
            fontSize: "0.82rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 4px 16px rgba(2, 132, 199, 0.4)",
            zIndex: 110,
            pointerEvents: "auto",
          }}
        >
          <span>🎯 LOCATION PICKING: Click anywhere on 3D mountain terrain to drop a monitoring point</span>
          <button
            onClick={() => setIsPickingLocation && setIsPickingLocation(false)}
            style={{
              background: "rgba(0, 0, 0, 0.25)",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              color: "#ffffff",
              padding: "2px 10px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.75rem",
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}

      {/* ── Hovered Site Tooltip Overlay ── */}
      {hoveredInfo && (
        <div
          style={{
            position: "absolute",
            bottom: 45,
            left: 14,
            background: "rgba(255, 255, 255, 0.96)",
            backdropFilter: "blur(8px)",
            borderRadius: 8,
            padding: "9px 13px",
            boxShadow: "0 4px 16px rgba(15, 23, 42, 0.14)",
            border: "1px solid #cbd5e1",
            pointerEvents: "none",
            zIndex: 100,
            maxWidth: 320,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#0f172a" }}>
            📍 {hoveredInfo.name || hoveredInfo.location_id || "Monitoring Station"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 2 }}>
            Satellite Elevation: <b>{hoveredInfo.elevation_m || 800}m</b> · Slope:{" "}
            <b>{hoveredInfo.slope_deg || 38}°</b>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#0284c7", marginTop: 3 }}>
            {hoveredInfo.rainfall_1h_mm != null && (
              <span>
                🌧️ Rain: <b>{hoveredInfo.rainfall_1h_mm.toFixed(1)} mm/h</b> ·{" "}
              </span>
            )}
            Stage: <b>{hoveredInfo.river_stage_state || "NORMAL"}</b>
          </div>
        </div>
      )}

      {/* ── Bottom Status Bar ── */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 12,
          right: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pointerEvents: "none",
          fontSize: "0.7rem",
          color: "#475569",
          background: "rgba(255, 255, 255, 0.88)",
          backdropFilter: "blur(6px)",
          padding: "5px 12px",
          borderRadius: 6,
          border: "1px solid rgba(226, 232, 240, 0.9)",
          zIndex: 5,
        }}
      >
        <div>
          🖱 <b>Drag</b> to rotate · <b>Scroll</b> to zoom · <b>Click heatmap</b> to inspect localized severity · <b>Click pin</b> for telemetry
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: satStatus === "live" ? "#16a34a" : "#0284c7",
              boxShadow: `0 0 6px ${satStatus === "live" ? "#22c55e" : "#38bdf8"}`,
            }}
          />
          <span style={{ fontWeight: 600 }}>
            {satStatus === "live"
              ? "📡 SRTM / Copernicus 90m Satellite DEM (Live)"
              : "🛰️ SRTM Satellite DEM (High-Fidelity Model)"}
          </span>
        </div>
      </div>
    </div>
  );
}
