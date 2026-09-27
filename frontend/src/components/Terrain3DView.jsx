import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useAppContext } from '../state/AppContext';
import { pilotLocations } from '../data/pilotLocations';
import defaultSatelliteDem from '../data/sikkim_satellite_dem.json';

import {
  BBOX,
  PLANE_SIZE,
  geoTo3D,
  dist2D,
  distToPolyline,
  sampleSatelliteElevation,
  processLiveWaterways,
  buildLiveRiverMeshes,
  buildValleySpatialIndex,
  carveValleyElevation,
} from '../utils/river3DBuilder';

// ArcGIS World Imagery Orthophoto REST Export API URL
const SATELLITE_API_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=88.35,27.10,88.85,27.75&bboxSR=4326&imageSR=4326&size=1024,1024&f=image';

const SEGS = 72; // Terrain mesh segment resolution (73x73 = 5,329 vertices)

function probColor(p) {
  if (p >= 0.8) return 0xdc2626;
  if (p >= 0.6) return 0xea580c;
  if (p >= 0.3) return 0xd97706;
  return 0x16a34a;
}

/**
 * Generates an instant high-resolution Earth observation canvas texture
 */
function createProceduralSatelliteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base Himalayan mountain vegetation gradient
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#1c301a');    // Northern alpine forest
  grad.addColorStop(0.3, '#2a4224');  // Mixed subalpine slopes
  grad.addColorStop(0.5, '#41522d');  // Valley slopes
  grad.addColorStop(0.7, '#243b22');  // Dense gorge vegetation
  grad.addColorStop(1, '#1b2c19');    // Southern foothills
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Micro-texture noise for forest canopy roughness
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n * 1.2));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n * 0.8));
  }
  ctx.putImageData(imgData, 0, 0);

  // Rocky ridge scarp lines
  ctx.strokeStyle = 'rgba(115, 110, 100, 0.45)';
  ctx.lineWidth = 14;
  ctx.filter = 'blur(6px)';
  ctx.beginPath();
  ctx.moveTo(60, 20);
  ctx.bezierCurveTo(160, 90, 220, 220, 210, 500);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(135, 125, 110, 0.35)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(480, 40);
  ctx.bezierCurveTo(340, 120, 310, 320, 320, 500);
  ctx.stroke();
  ctx.filter = 'none';

  // High northern alpine snow caps
  const snowGrad = ctx.createRadialGradient(90, 60, 5, 90, 60, 75);
  snowGrad.addColorStop(0, 'rgba(245, 248, 252, 0.9)');
  snowGrad.addColorStop(0.6, 'rgba(215, 230, 245, 0.5)');
  snowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = snowGrad;
  ctx.beginPath();
  ctx.arc(90, 60, 75, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Creates dynamic flowing water texture with waves and foam streaks
 */
function createFlowingWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024; // elongated along river length
  const ctx = canvas.getContext('2d');

  // Base deep glacial turquoise gradient
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#0369a1');   // Deep blue edge
  grad.addColorStop(0.2, '#0284c7'); // Clear turquoise current
  grad.addColorStop(0.5, '#38bdf8'); // Glacial water highlight
  grad.addColorStop(0.8, '#0284c7');
  grad.addColorStop(1, '#0369a1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1024);

  // Flowing current streaks and white-water rapids foam
  ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
  for (let y = 0; y < 1024; y += 18) {
    const w = 40 + Math.random() * 80;
    const x = 50 + Math.random() * 110;
    const h = 4 + Math.random() * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thin rapid wave highlights
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.8;
  for (let y = 10; y < 1024; y += 28) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.quadraticCurveTo(128, y + (Math.random() - 0.5) * 16, 196, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

export default function Terrain3DView({ predictions = {} }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const frameRef = useRef(null);
  const meshRef = useRef(null);
  const geoRef = useRef(null);
  const baseHeightsRef = useRef([]);
  const materialsRef = useRef({});
  const markersRef = useRef([]);
  const riverGroupRef = useRef(null);
  const waterTextureRef = useRef(null);

  const { setSelectedLocation, selectedLocation } = useAppContext();

  // View Controls State
  const [textureMode, setTextureMode] = useState('satellite'); // 'satellite' | 'topo' | 'hazard'
  const [vertExaggeration, setVertExaggeration] = useState(1.4);
  const vertExaggerationRef = useRef(vertExaggeration);
  useEffect(() => {
    vertExaggerationRef.current = vertExaggeration;
  }, [vertExaggeration]);

  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(autoRotate);
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const [flowSpeed, setFlowSpeed] = useState(1.0);
  const flowSpeedRef = useRef(flowSpeed);
  useEffect(() => {
    flowSpeedRef.current = flowSpeed;
  }, [flowSpeed]);

  const [satStatus, setSatStatus] = useState('loading'); // 'loading' | 'live' | 'cached'
  const [demSource, setDemSource] = useState('SRTM / Copernicus 90m Satellite DEM');
  const [hoveredSite, setHoveredSite] = useState(null);
  const [demMetadata, setDemMetadata] = useState({
    minElev: defaultSatelliteDem.min_elevation || 262,
    maxElev: defaultSatelliteDem.max_elevation || 5473,
    isLive: false,
  });

  // Active satellite DEM data and live OSM waterways
  const [satelliteData, setSatelliteData] = useState(defaultSatelliteDem);
  const [liveWaterways, setLiveWaterways] = useState([]);

  // 1. Fetch Live Satellite DEM from Backend on Mount
  useEffect(() => {
    let isSubscribed = true;
    async function loadLiveSatelliteData() {
      try {
        setSatStatus('loading');
        const res = await fetch('/api/terrain/live');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isSubscribed && data && data.elevations && data.elevations.length > 0) {
          setSatelliteData(data);
          setDemSource(data.source || 'SRTM / Copernicus 90m Satellite DEM');
          setDemMetadata({
            minElev: data.min_elevation,
            maxElev: data.max_elevation,
            isLive: !!data.is_live,
          });
          setSatStatus(data.is_live ? 'live' : 'cached');
          if (data.waterways && data.waterways.length > 0) {
            setLiveWaterways(data.waterways);
          }
        }
      } catch (err) {
        console.info('Live satellite DEM API info: Using high-detail cached satellite observation', err);
        if (isSubscribed) {
          setSatStatus('cached');
        }
      }
    }
    loadLiveSatelliteData();
    return () => {
      isSubscribed = false;
    };
  }, []);

  // 1b. Ingest Live OpenStreetMap Drainage Waterways from Backend
  useEffect(() => {
    let isSubscribed = true;
    async function loadWaterways() {
      try {
        const res = await fetch('/api/waterways/live');
        if (res.ok) {
          const data = await res.json();
          if (isSubscribed && data && data.waterways && data.waterways.length > 0) {
            setLiveWaterways(data.waterways);
          }
        }
      } catch (err) {
        console.warn('Notice: Live waterways loading note:', err);
      }
    }
    loadWaterways();
    return () => {
      isSubscribed = false;
    };
  }, []);

  // 2. Setup Three.js Scene once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || 600,
      H = el.clientHeight || 450;

    // A. Clean Atmospheric Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.005);

    // B. Camera
    const camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 900);
    camera.position.set(0, 52, 78);
    camera.lookAt(0, 8, 0);

    // C. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // D. Crisp Himalayan Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.95);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.45);
    sun.position.set(45, 95, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.5);
    fillLight.position.set(-45, 50, -35);
    scene.add(fillLight);

    // E. Terrain Geometry (72x72 resolution)
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

    // Process all live OSM waterways dynamically
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

    // F. Deform Mesh Vertices Using Real Satellite Elevation Data
    for (let i = 0; i < count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      const normX = (vx + PLANE_SIZE / 2) / PLANE_SIZE;
      const normZ = (vz + PLANE_SIZE / 2) / PLANE_SIZE;

      // Sample true satellite DEM
      const { hMeters, yWorld } = sampleSatelliteElevation(
        normX,
        normZ,
        elevations,
        gridSize,
        minElev,
        maxElev
      );

      // Hydrologically flatten the riverbed and alluvial valley floor along live rivers
      const carvedY = carveValleyElevation(vx, vz, yWorld, valleyIndex);

      baseHeights[i] = carvedY;
      pos.setY(i, carvedY * vertExaggeration);

      // Hypsometric tinting for Topographic DEM Material
      let r, g, b;
      if (hMeters < 600) {
        // Flat river basin & alluvial floodplain (Singtam / Rangpo)
        r = 0.22; g = 0.62; b = 0.36;
      } else if (hMeters < 1500) {
        // Subalpine gorge vegetation (Dikchu / lower Dzongu)
        r = 0.28; g = 0.54; b = 0.26;
      } else if (hMeters < 2800) {
        // Mid-slope mountain forest (Chungthang / Mangan)
        r = 0.56; g = 0.46; b = 0.28;
      } else if (hMeters < 4000) {
        // High alpine rocky crag & scree (Nathu La ridge)
        r = 0.54; g = 0.53; b = 0.54;
      } else {
        // Glaciated alpine snow caps (>4,000m)
        r = 0.94; g = 0.96; b = 0.99;
      }
      topoColors[i * 3] = r;
      topoColors[i * 3 + 1] = g;
      topoColors[i * 3 + 2] = b;
    }

    baseHeightsRef.current = baseHeights;
    geo.setAttribute('color', new THREE.BufferAttribute(topoColors, 3));
    geo.computeVertexNormals();

    // G. Materials Setup
    const fallbackSatTexture = createProceduralSatelliteTexture();
    const satMaterial = new THREE.MeshStandardMaterial({
      map: fallbackSatTexture,
      roughness: 0.82,
      metalness: 0.05,
      flatShading: false,
    });

    const topoMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: false,
    });

    // Hazard Heatmap Texture
    const hazardCanvas = document.createElement('canvas');
    hazardCanvas.width = 512;
    hazardCanvas.height = 512;
    const hctx = hazardCanvas.getContext('2d');
    const hGrad = hctx.createRadialGradient(256, 180, 25, 256, 256, 270);
    hGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');    // High hazard red
    hGrad.addColorStop(0.35, 'rgba(249, 115, 22, 0.75)'); // Warning orange
    hGrad.addColorStop(0.65, 'rgba(234, 179, 8, 0.5)');   // Watch yellow
    hGrad.addColorStop(1, 'rgba(34, 197, 94, 0.35)');     // Safe green
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

    // H. Main Terrain Mesh
    const terrainMesh = new THREE.Mesh(geo, satMaterial);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);
    meshRef.current = terrainMesh;

    // I. Wireframe Overlay
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x475569,
      transparent: true,
      opacity: 0.16,
    });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.visible = false;
    scene.add(wireMesh);

    // J. Construct 3D Real River Ribbon Following Exact OpenStreetMap Polyline
    // J. Construct 3D Real River Ribbons Following Exact OpenStreetMap Polylines
    const waterTexture = createFlowingWaterTexture();
    waterTextureRef.current = waterTexture;

    // Dynamically build 3D ribbon geometries for all live OSM rivers & tributaries
    const { riverGroup } = buildLiveRiverMeshes(
      processedRivers,
      vertExaggeration,
      waterTexture,
      THREE
    );
    scene.add(riverGroup);
    riverGroupRef.current = riverGroup;

    // K. Fetch Live ArcGIS Satellite Orthophoto Imagery
    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');
    texLoader.load(
      SATELLITE_API_URL,
      (liveTexture) => {
        liveTexture.wrapS = THREE.ClampToEdgeWrapping;
        liveTexture.wrapT = THREE.ClampToEdgeWrapping;
        liveTexture.colorSpace = THREE.SRGBColorSpace;
        satMaterial.map = liveTexture;
        satMaterial.needsUpdate = true;
      },
      undefined,
      (err) => console.info('Live ArcGIS satellite imagery note:', err)
    );

    // L. Place Accurate 3D Pins for Pilot Stations with Real Satellite Elevations
    const markers = pilotLocations.map((loc) => {
      const locId = loc.location_id || loc.id;
      const { x, z, normX, normZ } = geoTo3D(loc.lat, loc.lng);

      // Compute exact distance to nearest live OSM river
      let distKm = 0;
      if (processedRivers.length > 0) {
        let minDist = Infinity;
        for (const r of processedRivers) {
          const d = distToPolyline(x, z, r.points);
          if (d < minDist) minDist = d;
        }
        distKm = minDist * (60.0 / PLANE_SIZE); // 90 units ~ 60 km
      }

      // Sample satellite elevation at station position
      const { hMeters, yWorld } = sampleSatelliteElevation(
        normX,
        normZ,
        elevations,
        gridSize,
        minElev,
        maxElev
      );

      const siteAltitude = yWorld * vertExaggeration;

      const pred = predictions[locId];
      const lsP = pred?.prediction?.hazards?.landslide?.probability || 0;
      const flP = pred?.prediction?.hazards?.flood?.probability || 0;
      const riskP = Math.max(lsP, flP);
      const colorHex = probColor(riskP);

      // Pin Group
      const pinGroup = new THREE.Group();

      // Pin Head (Sphere)
      const headGeo = new THREE.SphereGeometry(1.6, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.y = 4.2;

      // Pin Stem (Cone pointing down to ground)
      const stemGeo = new THREE.ConeGeometry(0.7, 4.2, 8);
      stemGeo.rotateX(Math.PI);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = 2.1;

      // Pulsing Beacon Ring at Ground Surface
      const ringGeo = new THREE.RingGeometry(1.2, 2.0, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.1;

      pinGroup.add(headMesh);
      pinGroup.add(stemMesh);
      pinGroup.add(ringMesh);

      pinGroup.position.set(x, siteAltitude, z);
      pinGroup.userData = {
        loc,
        headMesh,
        ringMesh,
        baseY: siteAltitude,
        satelliteElevation: Math.round(hMeters),
        distToRiverKm: distKm.toFixed(1),
      };

      scene.add(pinGroup);
      return pinGroup;
    });
    markersRef.current = markers;

    // M. Raycasting for Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hitCandidates = markers.map((g) => g.userData.headMesh);
      const hits = raycaster.intersectObjects(hitCandidates);

      if (hits.length > 0) {
        const hitGroup = hits[0].object.parent;
        setHoveredSite({
          ...hitGroup.userData.loc,
          satelliteElevation: hitGroup.userData.satelliteElevation,
          distToRiverKm: hitGroup.userData.distToRiverKm,
        });
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredSite(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const onClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hitCandidates = markers.map((g) => g.userData.headMesh);
      const hits = raycaster.intersectObjects(hitCandidates);

      if (hits.length > 0) {
        const hitGroup = hits[0].object.parent;
        setSelectedLocation(hitGroup.userData.loc);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    // N. Orbit Controls (Mouse Drag & Scroll Zoom)
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let theta = 0.25;
    let phi = 0.52;
    let radius = 80;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      theta -= (e.clientX - prevMouse.x) * 0.007;
      phi = Math.max(0.12, Math.min(1.35, phi - (e.clientY - prevMouse.y) * 0.005));
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    const onWheel = (e) => {
      e.preventDefault();
      radius = Math.max(30, Math.min(145, radius + e.deltaY * 0.06));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // O. Animation Loop with Flowing River Water Simulation
    let clock = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      clock += 0.016;

      // 1. Auto-rotation when not dragging
      if (autoRotateRef.current && !isDragging) {
        theta += 0.002;
      }

      // 2. Camera spherical orbit
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = Math.max(12, radius * Math.sin(phi) + 12);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 8, 0);

      // 3. Flowing River Water Animation: Scroll UV along live river network
      const currentFlow = flowSpeedRef.current;
      if (waterTextureRef.current) {
        waterTextureRef.current.offset.y -= 0.0045 * currentFlow;
      }

      // 4. Subtle shimmer vertex ripple on all live OSM river meshes
      if (riverGroupRef.current) {
        riverGroupRef.current.children.forEach((rMesh, meshIdx) => {
          if (!rMesh.geometry) return;
          const rPos = rMesh.geometry.attributes.position;
          const bY = rMesh.userData?.baseY;
          if (rPos && bY) {
            for (let k = 0; k < rPos.count; k++) {
              const ripple = Math.sin(clock * 5.0 + k * 0.4 + meshIdx) * 0.05 * currentFlow;
              rPos.setY(k, bY[k] * vertExaggerationRef.current + ripple);
            }
            rPos.needsUpdate = true;
          }
        });
      }

      // 5. Pulse pin beacons & floating animation
      markers.forEach((pin, idx) => {
        const floatDelta = Math.sin(clock * 3.0 + idx * 1.2) * 0.4;
        pin.position.y = pin.userData.baseY + floatDelta;
        const ringScale = 1.0 + Math.sin(clock * 4.0 + idx) * 0.25;
        pin.userData.ringMesh.scale.set(ringScale, ringScale, ringScale);
      });

      renderer.render(scene, camera);
    };
    animate();

    // P. Window Resize Handler
    const onResize = () => {
      if (!el || !rendererRef.current) return;
      const nW = el.clientWidth;
      const nH = el.clientHeight;
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(nW, nH);
    };
    window.addEventListener('resize', onResize);

    meshRef.current._wireMesh = wireMesh;

    // Cleanup
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('wheel', onWheel);
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
  }, [satelliteData, liveWaterways]);

  // Update Material when textureMode changes
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

    // Scale all live OSM river ribbon heights to match vertical exaggeration
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

    // Adjust station pin heights
    if (markersRef.current) {
      markersRef.current.forEach((pin) => {
        const normY = pin.userData.baseY * (vertExaggeration / 1.4);
        pin.userData.baseY = normY;
        pin.position.y = normY;
      });
    }
  }, [vertExaggeration]);

  // Update Wireframe visibility
  useEffect(() => {
    if (meshRef.current?._wireMesh) {
      meshRef.current._wireMesh.visible = showWireframe;
    }
  }, [showWireframe]);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#f1f5f9',
        boxShadow: 'inset 0 0 1px rgba(0,0,0,0.1)',
      }}
    >
      {/* ── Top Bar Controls ── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
          padding: '8px 14px',
          borderRadius: 10,
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
          border: '1px solid #e2e8f0',
          zIndex: 10,
        }}
      >
        {/* Left: Mode Selector Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Terrain:
          </span>
          <button
            onClick={() => setTextureMode('satellite')}
            style={{
              padding: '5px 11px',
              fontSize: '0.78rem',
              fontWeight: 700,
              borderRadius: 6,
              border: textureMode === 'satellite' ? '1px solid #0284c7' : '1px solid #cbd5e1',
              background: textureMode === 'satellite' ? '#0284c7' : '#ffffff',
              color: textureMode === 'satellite' ? '#ffffff' : '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            🛰️ Satellite View
          </button>

          <button
            onClick={() => setTextureMode('topo')}
            style={{
              padding: '5px 11px',
              fontSize: '0.78rem',
              fontWeight: 700,
              borderRadius: 6,
              border: textureMode === 'topo' ? '1px solid #0f766e' : '1px solid #cbd5e1',
              background: textureMode === 'topo' ? '#0f766e' : '#ffffff',
              color: textureMode === 'topo' ? '#ffffff' : '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            🗺️ Topographic DEM
          </button>

          <button
            onClick={() => setTextureMode('hazard')}
            style={{
              padding: '5px 11px',
              fontSize: '0.78rem',
              fontWeight: 700,
              borderRadius: 6,
              border: textureMode === 'hazard' ? '1px solid #dc2626' : '1px solid #cbd5e1',
              background: textureMode === 'hazard' ? '#dc2626' : '#ffffff',
              color: textureMode === 'hazard' ? '#ffffff' : '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            📊 Hazard Heatmap
          </button>
        </div>

        {/* Right: Sliders & Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Vertical Exaggeration Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#475569' }}>
            <span style={{ fontWeight: 600 }}>Relief:</span>
            <input
              type="range"
              min="0.8"
              max="2.6"
              step="0.1"
              value={vertExaggeration}
              onChange={(e) => setVertExaggeration(parseFloat(e.target.value))}
              style={{ width: 70, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 700, minWidth: 26, color: '#0f172a' }}>{vertExaggeration.toFixed(1)}×</span>
          </div>

          {/* River Current Speed Toggle */}
          <button
            onClick={() => setFlowSpeed((s) => (s > 0 ? 0 : 1.0))}
            style={{
              padding: '4px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              borderRadius: 5,
              border: '1px solid #0284c7',
              background: flowSpeed > 0 ? '#e0f2fe' : '#ffffff',
              color: flowSpeed > 0 ? '#0369a1' : '#64748b',
              cursor: 'pointer',
            }}
            title="Toggle animated river flow"
          >
            🌊 {flowSpeed > 0 ? 'River Flow: Active' : 'River Flow: Paused'}
          </button>

          {/* Wireframe Toggle */}
          <button
            onClick={() => setShowWireframe(!showWireframe)}
            style={{
              padding: '4px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              borderRadius: 5,
              border: '1px solid #cbd5e1',
              background: showWireframe ? '#e2e8f0' : '#ffffff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            📐 Wireframe
          </button>

          {/* Auto Rotate Toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            style={{
              padding: '4px 9px',
              fontSize: '0.72rem',
              fontWeight: 600,
              borderRadius: 5,
              border: '1px solid #cbd5e1',
              background: autoRotate ? '#f0fdf4' : '#ffffff',
              color: autoRotate ? '#15803d' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {autoRotate ? '⏸ Pause Orbit' : '▶ Play Orbit'}
          </button>
        </div>
      </div>

      {/* ── Hovered / Selected Station Overlay ── */}
      {hoveredSite && (
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 14,
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(15,23,42,0.14)',
            border: '1px solid #cbd5e1',
            pointerEvents: 'none',
            zIndex: 10,
            maxWidth: 320,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>{hoveredSite.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background:
                  hoveredSite.hazard_typology === 'COMPOUND'
                    ? '#f3e8ff'
                    : hoveredSite.hazard_typology === 'LANDSLIDE_ONLY'
                    ? '#fef3c7'
                    : '#e0f2fe',
                color:
                  hoveredSite.hazard_typology === 'COMPOUND'
                    ? '#7e22ce'
                    : hoveredSite.hazard_typology === 'LANDSLIDE_ONLY'
                    ? '#b45309'
                    : '#0369a1',
              }}
            >
              {hoveredSite.hazard_typology === 'COMPOUND'
                ? '🔮 Compound Gorge'
                : hoveredSite.hazard_typology === 'LANDSLIDE_ONLY'
                ? '🏔️ High Alpine Ridge'
                : '🌊 River Basin Flat'}
            </span>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: 5, lineHeight: 1.4 }}>
            <div>
              🛰️ Satellite Elevation: <b>{hoveredSite.satelliteElevation || hoveredSite.elevation_m}m</b>
            </div>
            <div>
              🌊 Distance to Teesta River: <b>{hoveredSite.distToRiverKm} km</b>
            </div>
            <div style={{ color: '#64748b', fontSize: '0.68rem', marginTop: 2 }}>
              Coordinates: {hoveredSite.lat.toFixed(4)}°N, {hoveredSite.lng.toFixed(4)}°E
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Status Bar ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: 14,
          right: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          fontSize: '0.72rem',
          color: '#475569',
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(6px)',
          padding: '6px 14px',
          borderRadius: 6,
          border: '1px solid rgba(226, 232, 240, 0.9)',
          zIndex: 5,
        }}
      >
        <div>
          🖱 <b>Drag</b> to rotate · <b>Scroll</b> to zoom · <b>Hover pin</b> to inspect river distance
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: satStatus === 'live' ? '#16a34a' : satStatus === 'cached' ? '#0284c7' : '#f59e0b',
              boxShadow: `0 0 6px ${satStatus === 'live' ? '#22c55e' : '#38bdf8'}`,
            }}
          />
          <span style={{ fontWeight: 600 }}>
            {satStatus === 'live'
              ? `📡 ${demSource} (Live Internet Sync)`
              : satStatus === 'cached'
              ? `🛰️ ${demSource} (Cached Earth Observation)`
              : 'Streaming Live Satellite DEM Data…'}
          </span>
        </div>
      </div>
    </div>
  );
}

export { Terrain3DView };
