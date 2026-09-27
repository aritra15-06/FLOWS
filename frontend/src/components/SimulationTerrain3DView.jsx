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
  // 3D Controls passed from SimulationWorkspace upper deck
  textureMode: propTextureMode,
  setTextureMode: propSetTextureMode,
  vertExaggeration: propVertExaggeration,
  setVertExaggeration: propSetVertExaggeration,
  showWireframe: propShowWireframe,
  setShowWireframe: propSetShowWireframe,
  autoRotate: propAutoRotate,
  setAutoRotate: propSetAutoRotate,
  flowSpeed: propFlowSpeed,
  setFlowSpeed: propSetFlowSpeed,
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

  // Persistent Object Pools for high-performance 60 FPS animation (No allocation thrashing)
  const markersRef = useRef([]);
  const markersMapRef = useRef({});
  const cloudObjectsRef = useRef([]);
  const cloudsMapRef = useRef({});
  const floodSurgeMeshesRef = useRef([]);
  const floodMeshesMapRef = useRef({});

  const riverGroupRef = useRef(null);
  const normalWaterTexRef = useRef(null);
  const floodWaterTexRef = useRef(null);
  const normalWaterMatRef = useRef(null);
  const floodWaterMatRef = useRef(null);
  const hazardCanvasRef = useRef(null);
  const hazardTextureRef = useRef(null);
  const heatmapTimerRef = useRef(null);

  // Synchronized callback refs to eliminate stale closure bugs
  const isPickingLocationRef = useRef(isPickingLocation);
  useEffect(() => { isPickingLocationRef.current = isPickingLocation; }, [isPickingLocation]);

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  const onSelectSiteRef = useRef(onSelectSite);
  useEffect(() => { onSelectSiteRef.current = onSelectSite; }, [onSelectSite]);

  const setIsPickingLocationRef = useRef(setIsPickingLocation);
  useEffect(() => { setIsPickingLocationRef.current = setIsPickingLocation; }, [setIsPickingLocation]);

  // View state (uses props from upper menu with local fallbacks)
  const [localTextureMode, setLocalTextureMode] = useState("satellite");
  const textureMode = propTextureMode !== undefined ? propTextureMode : localTextureMode;
  const setTextureMode = propSetTextureMode || setLocalTextureMode;

  const [localVertExaggeration, setLocalVertExaggeration] = useState(1.4);
  const vertExaggeration = propVertExaggeration !== undefined ? propVertExaggeration : localVertExaggeration;
  const setVertExaggeration = propSetVertExaggeration || setLocalVertExaggeration;
  const vertExaggerationRef = useRef(vertExaggeration);
  useEffect(() => { vertExaggerationRef.current = vertExaggeration; }, [vertExaggeration]);

  const [localShowWireframe, setLocalShowWireframe] = useState(false);
  const showWireframe = propShowWireframe !== undefined ? propShowWireframe : localShowWireframe;
  const setShowWireframe = propSetShowWireframe || setLocalShowWireframe;

  const [localAutoRotate, setLocalAutoRotate] = useState(false);
  const autoRotate = propAutoRotate !== undefined ? propAutoRotate : localAutoRotate;
  const setAutoRotate = propSetAutoRotate || setLocalAutoRotate;
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  const [localFlowSpeed, setLocalFlowSpeed] = useState(1.0);
  const flowSpeed = propFlowSpeed !== undefined ? propFlowSpeed : localFlowSpeed;
  const setFlowSpeed = propSetFlowSpeed || setLocalFlowSpeed;
  const flowSpeedRef = useRef(flowSpeed);
  useEffect(() => { flowSpeedRef.current = flowSpeed; }, [flowSpeed]);

  const [satStatus, setSatStatus] = useState("loading");
  const [satelliteData, setSatelliteData] = useState(defaultSatelliteDem);
  const [liveWaterways, setLiveWaterways] = useState([]);


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
    hazardCanvas.width = 64;
    hazardCanvas.height = 64;
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

      const hitCandidates = markersRef.current.map((g) => g.userData?.headMesh).filter(Boolean);
      const hits = raycaster.intersectObjects(hitCandidates);
      if (hits.length > 0) {
        renderer.domElement.style.cursor = "pointer";
      } else {
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
          onMapClickRef.current(clampedLat, clampedLng);
          if (setIsPickingLocationRef.current) setIsPickingLocationRef.current(false);
          return;
        }
      }

      // Handle selecting existing site pin
      const hitCandidates = markersRef.current.map((g) => g.userData?.headMesh).filter(Boolean);
      const hits = raycaster.intersectObjects(hitCandidates);
      if (hits.length > 0) {
        const hitGroup = hits[0].object.parent;
        if (onSelectSiteRef.current && hitGroup.userData?.siteId) {
          onSelectSiteRef.current(hitGroup.userData.siteId);
        }
        return;
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
      if (normalWaterTexRef.current && currentFlow > 0) {
        normalWaterTexRef.current.offset.y -= 0.0045 * currentFlow;
      }
      if (floodWaterTexRef.current && currentFlow > 0) {
        floodWaterTexRef.current.offset.y -= 0.009 * currentFlow; // Rapid torrential flash flood flow
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
          const seed = fMesh.userData?.seed ?? 0;
          const pulse = 1.0 + Math.sin(clock * 4.0 + seed) * 0.15;
          fMesh.scale.set(pulse, 1.0, pulse);
          if (fMesh.material) {
            fMesh.material.opacity = 0.55 + Math.sin(clock * 3.5) * 0.15;
          }
        });
      }

      // Animate station beacon rings
      markersRef.current.forEach((pin, idx) => {
        const baseY = pin.userData?.baseY ?? 5.0;
        const floatDelta = Math.sin(clock * 3.0 + idx * 1.2) * 0.35;
        pin.position.y = baseY + floatDelta;
        if (pin.userData?.ringMesh) {
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
      // Clean object pools on scene destruction to avoid stale references
      markersMapRef.current = {};
      cloudsMapRef.current = {};
      floodMeshesMapRef.current = {};
      markersRef.current = [];
      cloudObjectsRef.current = [];
      floodSurgeMeshesRef.current = [];
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [satelliteData, liveWaterways, showInfrastructure, showPeople]);

  // 3. Update 3D Site Pins, Clouds, and Flood Inundations efficiently without recreation thrashing
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const elevations = satelliteData.elevations || defaultSatelliteDem.elevations;
    const gridSize = satelliteData.grid_size || defaultSatelliteDem.grid_size || 25;
    const minElev = satelliteData.min_elevation || 262;
    const maxElev = satelliteData.max_elevation || 5473;

    const allSitesMap = { ...sites };
    customSites.forEach((cs) => {
      if (!allSitesMap[cs.id]) {
        allSitesMap[cs.id] = cs;
      }
    });

    // Localized River Flash Flood Color Updating:
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

    // Clean up markers for removed custom sites
    Object.keys(markersMapRef.current).forEach((sid) => {
      if (!allSitesMap[sid]) {
        const pin = markersMapRef.current[sid];
        scene.remove(pin);
        pin.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
        delete markersMapRef.current[sid];

        if (cloudsMapRef.current[sid]) {
          scene.remove(cloudsMapRef.current[sid].cloudGroup);
          if (cloudsMapRef.current[sid].rainPoints) scene.remove(cloudsMapRef.current[sid].rainPoints);
          delete cloudsMapRef.current[sid];
        }

        if (floodMeshesMapRef.current[sid]) {
          scene.remove(floodMeshesMapRef.current[sid]);
          delete floodMeshesMapRef.current[sid];
        }
      }
    });

    Object.entries(allSitesMap).forEach(([siteId, data], idx) => {
      const params = data?.current_params || data;
      const lat = Number(params?.latitude ?? params?.lat);
      const lng = Number(params?.longitude ?? params?.lon ?? params?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const { x, z, normX, normZ } = geoTo3D(lat, lng);
      const { hMeters, yWorld } = sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev);
      const siteAltitude = yWorld * vertExaggeration;
      const colorHex = new THREE.Color(getSiteDisplayColor(data));
      const isSelected = selectedSite === siteId;

      let pinGroup = markersMapRef.current[siteId];
      if (!pinGroup) {
        // Create pin once!
        pinGroup = new THREE.Group();
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
        markersMapRef.current[siteId] = pinGroup;
      } else {
        // Ensure pin is attached to current scene
        if (pinGroup.parent !== scene) scene.add(pinGroup);
        pinGroup.userData.siteData = data;
        pinGroup.position.set(x, siteAltitude, z);
        pinGroup.userData.baseY = siteAltitude;
        const targetScale = isSelected ? 1.35 : 1.0;
        pinGroup.scale.set(targetScale, targetScale, targetScale);
        if (pinGroup.userData.headMesh) {
          pinGroup.userData.headMesh.material.color.copy(colorHex);
          pinGroup.userData.headMesh.material.emissive.copy(colorHex);
        }
        if (pinGroup.userData.ringMesh) {
          pinGroup.userData.ringMesh.material.color.copy(colorHex);
        }
      }

      // ── 3D CLOUD RAINING ANIMATION ──
      const rain1h = data?.rainfall_1h_mm ?? params?.rainfall_1h_mm ?? 0;
      const rain24h = data?.rainfall_24h_mm ?? params?.rainfall_24h_mm ?? 0;
      const isRaining = rain1h >= 5.0 || rain24h >= 40.0;
      const isHeavyStorm = rain1h >= 16.0 || rain24h >= 100.0;

      let cloudObj = cloudsMapRef.current[siteId];
      if (isRaining) {
        if (!cloudObj) {
          const cloudGroup = new THREE.Group();
          const cloudAltitude = siteAltitude + 12.0;

          const cloudMat = new THREE.MeshStandardMaterial({
            color: isHeavyStorm ? 0x1e293b : 0x475569,
            roughness: 0.85,
            metalness: 0.05,
          });

          const puff1 = new THREE.Mesh(new THREE.SphereGeometry(3.6, 10, 10), cloudMat);
          const puff2 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 8), cloudMat);
          puff2.position.set(2.4, 0.4, 0.5);
          const puff3 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 8), cloudMat);
          puff3.position.set(-2.2, 0.2, -0.4);
          const puff4 = new THREE.Mesh(new THREE.SphereGeometry(2.0, 8, 8), cloudMat);
          puff4.position.set(0.6, 1.4, -0.6);

          cloudGroup.add(puff1);
          cloudGroup.add(puff2);
          cloudGroup.add(puff3);
          cloudGroup.add(puff4);
          cloudGroup.position.set(x, cloudAltitude, z);
          scene.add(cloudGroup);

          const rainCount = 120;
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

          cloudObj = {
            cloudGroup,
            rainPoints,
            rainGeo,
            groundY: siteAltitude,
            baseY: cloudAltitude,
            rainSpeed: 36.0,
            seed: idx * 1.5,
          };
          cloudsMapRef.current[siteId] = cloudObj;
        } else {
          if (cloudObj.cloudGroup.parent !== scene) scene.add(cloudObj.cloudGroup);
          if (cloudObj.rainPoints && cloudObj.rainPoints.parent !== scene) scene.add(cloudObj.rainPoints);
          cloudObj.cloudGroup.visible = true;
          if (cloudObj.rainPoints) cloudObj.rainPoints.visible = true;
          cloudObj.cloudGroup.position.set(x, siteAltitude + 12.0, z);
          cloudObj.groundY = siteAltitude;
          cloudObj.baseY = siteAltitude + 12.0;
        }
      } else if (cloudObj) {
        cloudObj.cloudGroup.visible = false;
        if (cloudObj.rainPoints) cloudObj.rainPoints.visible = false;
      }

      // ── 3D FLOOD INUNDATION ANIMATION ──
      const isOverbank =
        data?.river_stage_state === "OVERBANK_FLOODING" ||
        data?.river_stage_state === "CATASTROPHIC_SURGE";

      let floodMesh = floodMeshesMapRef.current[siteId];
      if (isOverbank) {
        if (!floodMesh) {
          const floodGeo = new THREE.CircleGeometry(4.8, 16);
          floodGeo.rotateX(-Math.PI / 2);
          const floodMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
          });
          floodMesh = new THREE.Mesh(floodGeo, floodMat);
          floodMesh.position.set(x, siteAltitude + 0.15, z);
          floodMesh.userData = { seed: idx * 2.0 };
          scene.add(floodMesh);
          floodMeshesMapRef.current[siteId] = floodMesh;
        } else {
          if (floodMesh.parent !== scene) scene.add(floodMesh);
          floodMesh.visible = true;
          floodMesh.position.set(x, siteAltitude + 0.15, z);
        }
      } else if (floodMesh) {
        floodMesh.visible = false;
      }
    });

    markersRef.current = Object.values(markersMapRef.current);
    cloudObjectsRef.current = Object.values(cloudsMapRef.current).filter((c) => c.cloudGroup.visible);
    floodSurgeMeshesRef.current = Object.values(floodMeshesMapRef.current).filter((f) => f.visible);
  }, [sites, customSites, selectedSite, vertExaggeration, satelliteData]);

  // 3b. Dynamic Continuous Hazard Heatmap Synchronizer (Debounced & runs ONLY when in hazard mode)
  useEffect(() => {
    if (textureMode !== "hazard") return;
    if (!hazardCanvasRef.current || !hazardTextureRef.current) return;

    clearTimeout(heatmapTimerRef.current);
    heatmapTimerRef.current = setTimeout(() => {
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
      if (hazardTextureRef.current) {
        hazardTextureRef.current.needsUpdate = true;
      }
      if (meshRef.current?.material) {
        meshRef.current.material.needsUpdate = true;
      }
    }, 250);

    return () => clearTimeout(heatmapTimerRef.current);
  }, [sites, customSites, satelliteData, liveWaterways, hazardMode, textureMode]);

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
        background: "#080d1a",
        overflow: "hidden",
        cursor: isPickingLocation ? "crosshair" : "grab",
      }}
    />
  );
}
