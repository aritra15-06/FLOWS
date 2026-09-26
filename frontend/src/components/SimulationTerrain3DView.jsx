import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ROAD_CORRIDORS, SIKKIM_SETTLEMENTS, MOCK_POPULATION } from "../data/mockPopulation";
import defaultSatelliteDem from "../data/sikkim_satellite_dem.json";

// Geographic Bounding Box for Sikkim Teesta Corridor
const BBOX = {
  minLat: 27.10,
  maxLat: 27.75,
  minLng: 88.35,
  maxLng: 88.85,
};

const SATELLITE_API_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=88.35,27.10,88.85,27.75&bboxSR=4326&imageSR=4326&size=1024,1024&f=image";

const PLANE_SIZE = 90; // 3D plane dimensions in Three.js units (~50km E-W, ~72km N-S)
const SEGS = 72;       // Terrain mesh resolution (73x73 = 5,329 vertices)

function geoTo3D(lat, lng) {
  const normX = (lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng);
  const normZ = (BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat);
  const x = (normX - 0.5) * PLANE_SIZE;
  const z = (normZ - 0.5) * PLANE_SIZE;
  return { x, z, normX, normZ };
}

function threeToGeo(x, z) {
  const normX = x / PLANE_SIZE + 0.5;
  const normZ = z / PLANE_SIZE + 0.5;
  const lng = BBOX.minLng + normX * (BBOX.maxLng - BBOX.minLng);
  const lat = BBOX.maxLat - normZ * (BBOX.maxLat - BBOX.minLat);
  return { lat, lng };
}

function dist2D(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

function distToPolyline(px, pz, polyline3D) {
  let minDist = Infinity;
  for (let i = 0; i < polyline3D.length - 1; i++) {
    const p1 = polyline3D[i];
    const p2 = polyline3D[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq === 0 ? 0 : ((px - p1.x) * dx + (pz - p1.z) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = p1.x + t * dx;
    const projZ = p1.z + t * dz;
    const d = dist2D(px, pz, projX, projZ);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev) {
  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedZ = Math.max(0, Math.min(1, normZ));

  const gx = clampedX * (gridSize - 1);
  const gz = clampedZ * (gridSize - 1);

  const col0 = Math.floor(gx);
  const col1 = Math.min(gridSize - 1, col0 + 1);
  const row0 = Math.floor(gz);
  const row1 = Math.min(gridSize - 1, row0 + 1);

  const fx = gx - col0;
  const fz = gz - row0;

  const idx00 = row0 * gridSize + col0;
  const idx10 = row0 * gridSize + col1;
  const idx01 = row1 * gridSize + col0;
  const idx11 = row1 * gridSize + col1;

  const h00 = elevations[idx00] ?? minElev;
  const h10 = elevations[idx10] ?? minElev;
  const h01 = elevations[idx01] ?? minElev;
  const h11 = elevations[idx11] ?? minElev;

  const hTop = h00 * (1 - fx) + h10 * fx;
  const hBot = h01 * (1 - fx) + h11 * fx;
  const hMeters = hTop * (1 - fz) + hBot * fz;

  const elevNorm = Math.max(0, Math.min(1, (hMeters - minElev) / Math.max(1, maxElev - minElev)));
  const yWorld = elevNorm * 26.0 + 2.0;

  return { hMeters, yWorld };
}

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

  // Snow on highest northern ridges
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

function createFlowingWaterTexture(isFloodSurge = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  if (isFloodSurge) {
    // Churning muddy torrent with red/brown flood sediment
    grad.addColorStop(0, "#7f1d1d");
    grad.addColorStop(0.2, "#991b1b");
    grad.addColorStop(0.5, "#b91c1c");
    grad.addColorStop(0.8, "#991b1b");
    grad.addColorStop(1, "#7f1d1d");
  } else {
    // Clear Himalayan glacial turquoise baseflow
    grad.addColorStop(0, "#0369a1");
    grad.addColorStop(0.2, "#0284c7");
    grad.addColorStop(0.5, "#38bdf8");
    grad.addColorStop(0.8, "#0284c7");
    grad.addColorStop(1, "#0369a1");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1024);

  // Foam streaks and turbulent rapids
  ctx.fillStyle = isFloodSurge ? "rgba(254, 226, 226, 0.55)" : "rgba(224, 242, 254, 0.35)";
  for (let y = 0; y < 1024; y += isFloodSurge ? 12 : 18) {
    const w = 40 + Math.random() * 85;
    const x = 50 + Math.random() * 110;
    const h = 4 + Math.random() * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // White water rapid crest highlights
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = isFloodSurge ? 2.5 : 1.8;
  for (let y = 10; y < 1024; y += isFloodSurge ? 18 : 28) {
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.quadraticCurveTo(128, y + (Math.random() - 0.5) * 20, 206, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
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
  const riverMeshRef = useRef(null);
  const normalWaterTexRef = useRef(null);
  const floodWaterTexRef = useRef(null);

  // View state
  const [textureMode, setTextureMode] = useState("satellite"); // "satellite" | "topo" | "hazard"
  const [vertExaggeration, setVertExaggeration] = useState(1.4);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [flowSpeed, setFlowSpeed] = useState(1.0);
  const [satStatus, setSatStatus] = useState("loading");
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [satelliteData, setSatelliteData] = useState(defaultSatelliteDem);

  // Check if any site has catastrophic/overbank flood surge
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
        }
      } catch (err) {
        console.info("Using cached satellite observation for 3D terrain simulation", err);
        if (isSubscribed) setSatStatus("cached");
      }
    }
    loadLiveSatelliteData();
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
    renderer.domElement.style.display = "block";
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

    // Terrain Geometry (Deformed with authentic satellite DEM)
    const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    geoRef.current = geo;

    const pos = geo.attributes.position;
    const count = pos.count;
    const baseHeights = new Float32Array(count);
    const topoColors = new Float32Array(count * 3);

    // Extract real OSM Teesta polyline
    const riverRaw = satelliteData.teesta_trunk || defaultSatelliteDem.teesta_trunk || [];
    const river3D = riverRaw.map((pt) => {
      const { x, z, normX, normZ } = geoTo3D(pt[0], pt[1]);
      return { x, z, normX, normZ, lat: pt[0], lng: pt[1] };
    });

    const elevations = satelliteData.elevations || defaultSatelliteDem.elevations;
    const gridSize = satelliteData.grid_size || defaultSatelliteDem.grid_size || 25;
    const minElev = satelliteData.min_elevation || 262;
    const maxElev = satelliteData.max_elevation || 5473;

    // Deform vertices with real satellite elevations & carve canyon
    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const normX = (vx + PLANE_SIZE / 2) / PLANE_SIZE;
      const normZ = (vz + PLANE_SIZE / 2) / PLANE_SIZE;

      const { hMeters, yWorld } = sampleSatelliteElevation(
        normX, normZ, elevations, gridSize, minElev, maxElev
      );

      let carvedY = yWorld;
      if (river3D.length > 1) {
        const distRiver = distToPolyline(vx, vz, river3D);
        const canyonWidth = 2.4;
        if (distRiver < canyonWidth) {
          const cutFraction = Math.pow(1 - distRiver / canyonWidth, 2);
          carvedY = Math.max(1.2, carvedY - cutFraction * 3.2);
        }
      }

      baseHeights[i] = carvedY;
      pos.setY(i, carvedY * vertExaggeration);

      // Hypsometric colors
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

    // Textures & Materials
    const fallbackSatTexture = createProceduralSatelliteTexture();
    const satMaterial = new THREE.MeshStandardMaterial({
      map: fallbackSatTexture,
      roughness: 0.82,
      metalness: 0.05,
    });
    const topoMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
    });

    // Dynamic Hazard Risk Heatmap Material
    const hazardCanvas = document.createElement("canvas");
    hazardCanvas.width = 512;
    hazardCanvas.height = 512;
    const hctx = hazardCanvas.getContext("2d");
    const hGrad = hctx.createRadialGradient(256, 180, 25, 256, 256, 270);
    hGrad.addColorStop(0, "rgba(239, 68, 68, 0.85)");
    hGrad.addColorStop(0.35, "rgba(249, 115, 22, 0.75)");
    hGrad.addColorStop(0.65, "rgba(234, 179, 8, 0.5)");
    hGrad.addColorStop(1, "rgba(34, 197, 94, 0.35)");
    hctx.fillStyle = hGrad;
    hctx.fillRect(0, 0, 512, 512);
    const hazardTexture = new THREE.CanvasTexture(hazardCanvas);
    const hazardMaterial = new THREE.MeshStandardMaterial({
      map: hazardTexture,
      roughness: 0.8,
      metalness: 0.1,
    });

    materialsRef.current = {
      satellite: satMaterial,
      topo: topoMaterial,
      hazard: hazardMaterial,
    };

    const terrainMesh = new THREE.Mesh(geo, satMaterial);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);
    meshRef.current = terrainMesh;

    // Wireframe overlay
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.16 });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.visible = false;
    scene.add(wireMesh);

    // River Textures (Baseflow vs High Flood Surge)
    const normalWaterTex = createFlowingWaterTexture(false);
    const floodWaterTex = createFlowingWaterTexture(true);
    normalWaterTexRef.current = normalWaterTex;
    floodWaterTexRef.current = floodWaterTex;

    // Build 3D River Ribbon from OSM Polyline
    if (river3D.length > 2) {
      const riverPtsCount = river3D.length;
      const riverGeo = new THREE.BufferGeometry();
      const riverVerts = new Float32Array(riverPtsCount * 2 * 3);
      const riverUVs = new Float32Array(riverPtsCount * 2 * 2);
      const riverIndices = [];

      let accumDistance = 0;
      for (let i = 0; i < riverPtsCount; i++) {
        const pt = river3D[i];
        const { yWorld } = sampleSatelliteElevation(pt.normX, pt.normZ, elevations, gridSize, minElev, maxElev);
        const ry = (yWorld - 1.6) * vertExaggeration;

        let tx = 0, tz = 1;
        if (i < riverPtsCount - 1) {
          const next = river3D[i + 1];
          const prev = i > 0 ? river3D[i - 1] : pt;
          tx = next.x - prev.x;
          tz = next.z - prev.z;
          const len = Math.hypot(tx, tz) || 1;
          tx /= len;
          tz /= len;
          if (i > 0) accumDistance += Math.hypot(pt.x - prev.x, pt.z - prev.z);
        } else {
          const prev = river3D[i - 1];
          tx = pt.x - prev.x;
          tz = pt.z - prev.z;
          const len = Math.hypot(tx, tz) || 1;
          tx /= len;
          tz /= len;
          accumDistance += Math.hypot(pt.x - prev.x, pt.z - prev.z);
        }

        const nx = -tz;
        const nz = tx;
        const widthProgress = i / (riverPtsCount - 1);
        const riverWidth = 1.4 + widthProgress * 1.6;

        const lx = pt.x - nx * (riverWidth / 2);
        const lz = pt.z - nz * (riverWidth / 2);
        const rx = pt.x + nx * (riverWidth / 2);
        const rz = pt.z + nz * (riverWidth / 2);

        const vIdx = i * 2;
        riverVerts[vIdx * 3] = lx;
        riverVerts[vIdx * 3 + 1] = ry;
        riverVerts[vIdx * 3 + 2] = lz;

        riverVerts[(vIdx + 1) * 3] = rx;
        riverVerts[(vIdx + 1) * 3 + 1] = ry;
        riverVerts[(vIdx + 1) * 3 + 2] = rz;

        const vCoord = accumDistance * 0.15;
        riverUVs[vIdx * 2] = 0;
        riverUVs[vIdx * 2 + 1] = vCoord;
        riverUVs[(vIdx + 1) * 2] = 1;
        riverUVs[(vIdx + 1) * 2 + 1] = vCoord;

        if (i < riverPtsCount - 1) {
          riverIndices.push(vIdx, vIdx + 1, vIdx + 2);
          riverIndices.push(vIdx + 1, vIdx + 3, vIdx + 2);
        }
      }

      riverGeo.setAttribute("position", new THREE.BufferAttribute(riverVerts, 3));
      riverGeo.setAttribute("uv", new THREE.BufferAttribute(riverUVs, 2));
      riverGeo.setIndex(riverIndices);
      riverGeo.computeVertexNormals();

      const riverMat = new THREE.MeshStandardMaterial({
        map: normalWaterTex,
        roughness: 0.12,
        metalness: 0.45,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });

      const riverMesh = new THREE.Mesh(riverGeo, riverMat);
      scene.add(riverMesh);
      riverMeshRef.current = riverMesh;
    }

    // Stream Live ArcGIS Satellite Orthophoto
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

    // Highway Corridors (NH-10 & SH-1/2) in 3D
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

    // Sikkim Settlement Villages in 3D
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

    // Human Citizens in 3D
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

      if (isPickingLocation) {
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

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Handle custom site dropping
      if (isPickingLocation && onMapClick && meshRef.current) {
        const hits = raycaster.intersectObject(meshRef.current);
        if (hits.length > 0) {
          const pt = hits[0].point;
          const { lat, lng } = threeToGeo(pt.x, pt.z);
          onMapClick(lat, lng);
          if (setIsPickingLocation) setIsPickingLocation(false);
          return;
        }
      }

      // Handle selecting existing site
      const hitCandidates = markersRef.current.map((g) => g.userData.headMesh).filter(Boolean);
      const hits = raycaster.intersectObjects(hitCandidates);
      if (hits.length > 0) {
        const hitGroup = hits[0].object.parent;
        if (onSelectSite && hitGroup.userData.siteId) {
          onSelectSite(hitGroup.userData.siteId);
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
      prevMouse = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = "grabbing";
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      theta -= (e.clientX - prevMouse.x) * 0.007;
      phi = Math.max(0.12, Math.min(1.35, phi - (e.clientY - prevMouse.y) * 0.005));
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = isPickingLocation ? "crosshair" : "grab";
    };
    const onWheel = (e) => {
      e.preventDefault();
      radius = Math.max(28, Math.min(150, radius + e.deltaY * 0.06));
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Animation Loop with 3D Flowing Water, Raindrops & Flood Surge Simulation
    let clock = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      clock += 0.016;

      if (autoRotate && !isDragging) {
        theta += 0.0018;
      }

      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = Math.max(12, radius * Math.sin(phi) + 12);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 8, 0);

      // Flowing water UV translation along OSM river curves
      const speedMult = hasActiveFloodSurge ? 2.8 : 1.0;
      if (normalWaterTexRef.current) {
        normalWaterTexRef.current.offset.y -= 0.0045 * flowSpeed * speedMult;
      }
      if (floodWaterTexRef.current) {
        floodWaterTexRef.current.offset.y -= 0.0045 * flowSpeed * speedMult;
      }

      // Shimmer river wave ripples
      if (riverMeshRef.current && riverMeshRef.current.geometry) {
        const rPos = riverMeshRef.current.geometry.attributes.position;
        if (rPos && !riverMeshRef.current._baseY) {
          riverMeshRef.current._baseY = new Float32Array(rPos.count);
          for (let k = 0; k < rPos.count; k++) {
            riverMeshRef.current._baseY[k] = rPos.getY(k);
          }
        }
        if (riverMeshRef.current._baseY) {
          const bY = riverMeshRef.current._baseY;
          for (let k = 0; k < rPos.count; k++) {
            const ripple = Math.sin(clock * 5.5 + k * 0.35) * 0.06 * flowSpeed;
            rPos.setY(k, bY[k] + ripple);
          }
          rPos.needsUpdate = true;
        }
      }

      // Animate 3D Raining Clouds (Falling Rain Particles + Lightning Flashes)
      if (cloudObjectsRef.current.length > 0) {
        cloudObjectsRef.current.forEach((cObj) => {
          // Bob cloud slightly
          cObj.cloudGroup.position.y = cObj.baseY + Math.sin(clock * 2.0 + cObj.seed) * 0.35;

          // Animate falling rain particles
          if (cObj.rainGeo) {
            const rPositions = cObj.rainGeo.attributes.position.array;
            for (let pIdx = 0; pIdx < rPositions.length / 3; pIdx++) {
              rPositions[pIdx * 3 + 1] -= cObj.rainSpeed * 0.016;
              // Reset raindrop back to cloud bottom when it hits terrain
              if (rPositions[pIdx * 3 + 1] < cObj.groundY) {
                rPositions[pIdx * 3 + 1] = cObj.baseY - 1.5;
              }
            }
            cObj.rainGeo.attributes.position.needsUpdate = true;
          }

          // Animate lightning flash for heavy storms
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
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [satelliteData, showInfrastructure, showPeople]);

  // 3. Rebuild 3D Site Pins, Clouds, and Flood Inundations when Simulation State Updates
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous markers, clouds, and flood surge meshes
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

    // Switch river texture if flood surge active
    if (riverMeshRef.current) {
      riverMeshRef.current.material.map = hasActiveFloodSurge
        ? floodWaterTexRef.current
        : normalWaterTexRef.current;
      riverMeshRef.current.material.needsUpdate = true;
    }

    const allSitesMap = { ...sites };
    customSites.forEach((cs) => { allSitesMap[cs.id] = cs; });

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

      // Pin Group
      const pinGroup = new THREE.Group();
      const pinScale = isSelected ? 1.35 : 1.0;

      // Pin Head
      const headGeo = new THREE.SphereGeometry(1.6 * pinScale, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.y = 4.2 * pinScale;

      // Pin Stem
      const stemGeo = new THREE.ConeGeometry(0.7 * pinScale, 4.2 * pinScale, 8);
      stemGeo.rotateX(Math.PI);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = 2.1 * pinScale;

      // Glowing Ground Beacon Ring
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

        // Puffy volumetric 3D Cloud Mesh
        const cloudMat = new THREE.MeshStandardMaterial({
          color: isHeavyStorm ? 0x1e293b : 0x475569,
          roughness: 0.85,
          metalness: 0.05,
        });

        // Merged puffs
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

        // 3D Rain Particle System
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

        // Lightning flash point light for heavy storm
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
        // Expandable pulsing flood inundation buffer plane
        const floodGeo = new THREE.CircleGeometry(4.8, 24);
        floodGeo.rotateX(-Math.PI / 2);
        const floodMat = new THREE.MeshBasicMaterial({
          color: 0xdc2626,
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
  }, [sites, customSites, selectedSite, vertExaggeration, hasActiveFloodSurge, satelliteData]);

  // Update Material on mode change
  useEffect(() => {
    if (!meshRef.current || !materialsRef.current) return;
    const targetMat = materialsRef.current[textureMode];
    if (targetMat) {
      meshRef.current.material = targetMat;
      meshRef.current.material.needsUpdate = true;
    }
  }, [textureMode]);

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
        {/* Left: Texture Selector */}
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
            📊 Hazard Threat
          </button>

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
            background: "rgba(220, 38, 38, 0.95)",
            color: "#ffffff",
            padding: "5px 12px",
            borderRadius: 6,
            fontSize: "0.75rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 12px rgba(220, 38, 38, 0.35)",
            zIndex: 90,
          }}
        >
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ffffff" }} />
          🌊 3D FLOOD SURGE ACTIVE: Churning muddy torrent and overbank inundation visible
        </div>
      )}

      {/* ── Location Picking Banner ── */}
      {isPickingLocation && (
        <div
          style={{
            position: "absolute",
            top: 54,
            left: 14,
            right: 14,
            background: "rgba(2, 132, 199, 0.95)",
            color: "#ffffff",
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: "0.78rem",
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
            zIndex: 90,
          }}
        >
          <span>🎯 LOCATION PICKING: Click any mountain slope or river valley on the 3D satellite terrain</span>
          <button
            onClick={() => setIsPickingLocation && setIsPickingLocation(false)}
            style={{
              background: "rgba(255, 255, 255, 0.2)",
              border: "none",
              color: "#ffffff",
              padding: "2px 8px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 700,
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
            Satellite Elevation: <b>{hoveredInfo.elevation_m || 800}m</b> · Slope: <b>{hoveredInfo.slope_deg || 38}°</b>
          </div>
          <div style={{ fontSize: "0.72rem", color: "#0284c7", marginTop: 3 }}>
            {hoveredInfo.rainfall_1h_mm != null && (
              <span>🌧️ Rain: <b>{hoveredInfo.rainfall_1h_mm.toFixed(1)} mm/h</b> · </span>
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
          🖱 <b>Drag</b> to rotate · <b>Scroll</b> to zoom · <b>Click pin</b> to inspect telemetry
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
