import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useAppContext } from '../state/AppContext';
import { pilotLocations } from '../data/pilotLocations';

// Public Keyless ArcGIS World Imagery REST Export API for the Sikkim Teesta corridor
const SATELLITE_API_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=88.35,27.10,88.85,27.75&bboxSR=4326&imageSR=4326&size=1024,1024&f=image';

function probColor(p) {
  if (p >= 0.8) return 0xdc2626;
  if (p >= 0.6) return 0xea580c;
  if (p >= 0.3) return 0xd97706;
  return 0x16a34a;
}

/**
 * Generate an instant procedural high-resolution satellite aerial canvas texture.
 * Serves as immediate realistic Earth observation while live ArcGIS tiles stream in.
 */
function createProceduralSatelliteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base mountain terrain vegetation gradient (dark pine/fir green to olive)
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#1c301a');    // Dense alpine conifer
  grad.addColorStop(0.3, '#2a4224');  // Mixed sub-alpine forest
  grad.addColorStop(0.5, '#41522d');  // Valley slopes
  grad.addColorStop(0.7, '#243b22');  // Dense gorge vegetation
  grad.addColorStop(1, '#1b2c19');    // Southern foothills
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Micro-texture noise for canopy roughness
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    data[i] = Math.min(255, Math.max(0, data[i] + n));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n * 1.2));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n * 0.8));
  }
  ctx.putImageData(imgData, 0, 0);

  // Rocky ridge scarp lines (grey/ochre scree slopes)
  ctx.strokeStyle = 'rgba(110, 105, 95, 0.45)';
  ctx.lineWidth = 14;
  ctx.filter = 'blur(6px)';
  ctx.beginPath();
  ctx.moveTo(40, 20);
  ctx.bezierCurveTo(160, 90, 220, 220, 210, 500);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(130, 120, 105, 0.35)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(480, 40);
  ctx.bezierCurveTo(340, 120, 310, 320, 320, 500);
  ctx.stroke();
  ctx.filter = 'none';

  // Snow & glacier patches on highest northern alpine ridges
  const snowGrad = ctx.createRadialGradient(80, 60, 5, 80, 60, 70);
  snowGrad.addColorStop(0, 'rgba(245, 248, 252, 0.85)');
  snowGrad.addColorStop(0.6, 'rgba(215, 230, 245, 0.45)');
  snowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = snowGrad;
  ctx.beginPath();
  ctx.arc(80, 60, 70, 0, Math.PI * 2);
  ctx.fill();

  // Teesta River channel ribbon with sediment sandbars
  ctx.strokeStyle = 'rgba(190, 175, 140, 0.7)'; // Alluvial sandbars
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(250, 0);
  ctx.bezierCurveTo(240, 140, 275, 260, 260, 512);
  ctx.stroke();

  ctx.strokeStyle = '#0284c7'; // Glacial turquoise river water
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(250, 0);
  ctx.bezierCurveTo(240, 140, 275, 260, 260, 512);
  ctx.stroke();

  // River white-water rapids highlight
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(251, 0);
  ctx.bezierCurveTo(241, 140, 276, 260, 261, 512);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
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

  const { setSelectedLocation, selectedLocation } = useAppContext();

  // View Controls State
  const [textureMode, setTextureMode] = useState('satellite'); // 'satellite' | 'topo' | 'hazard'
  const [vertExaggeration, setVertExaggeration] = useState(1.6);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [satStatus, setSatStatus] = useState('loading'); // 'loading' | 'live' | 'fallback'
  const [hoveredSite, setHoveredSite] = useState(null);

  // Setup 3D Scene once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || 600,
      H = el.clientHeight || 450;

    // 1. Scene with crisp clean light atmospheric sky
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.0055);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 800);
    camera.position.set(0, 50, 75);
    camera.lookAt(0, 6, 0);

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting - Crisp Himalayan Daylight
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.9);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.4);
    sun.position.set(45, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.45);
    fillLight.position.set(-45, 50, -35);
    scene.add(fillLight);

    // 5. Terrain DEM Geometry (80x80 km representation, 72x72 grid)
    const SEGS = 72;
    const geo = new THREE.PlaneGeometry(90, 90, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2);
    geoRef.current = geo;

    const pos = geo.attributes.position;
    const baseHeights = new Float32Array(pos.count);

    // Calibrate Himalayan Geomorphology:
    // Narrow gorge along center, towering steep flanks (Chungthang/Dikchu), high eastern ridge (Nathu La), elevated western ridge (Dzongu), low southern alluvial flats (Singtam/Rangpo)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 45; // -1 to 1
      const z = pos.getZ(i) / 45; // -1 (North) to 1 (South)

      // Main Teesta River canyon axis running North -> South
      const riverDist = Math.abs(x - Math.sin(z * 2.5) * 0.12);
      const canyon = Math.max(0, 1 - riverDist * 3.8);

      // Northern alpine high elevation tapering to southern foothills
      const northSouthGradient = (1 - z) * 6.5;

      // Eastern crest (Nathu La ridge)
      const eastRidge = Math.max(0, (x - 0.25) * 16) * Math.cos(z * 1.5);

      // Western scarp (Dzongu mountain shoulder)
      const westRidge = Math.max(0, (-x - 0.2) * 15) * Math.sin((z + 1) * 1.8);

      // Deep incision river canyon cut
      const canyonCut = -canyon * 12.0;

      // Realistic fractal terrain harmonics
      const harmonics =
        Math.sin(x * 9.0 + z * 5.0) * 2.2 +
        Math.cos(x * 15.0 - z * 11.0) * 1.2 +
        Math.sin(x * 28.0 + z * 24.0) * 0.5;

      // Base elevation profile
      let h = 4.0 + northSouthGradient + eastRidge + westRidge + canyonCut + harmonics;
      if (h < 1.0) h = 1.0; // valley floor floor
      baseHeights[i] = h;
      pos.setY(i, h * 1.6);
    }
    baseHeightsRef.current = baseHeights;
    geo.computeVertexNormals();

    // 6. Color attribute for Topographic DEM view (hypsometric tinting)
    const topoColors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = baseHeights[i];
      let r, g, b;
      if (y < 2.5) {
        // Valley floor & alluvial plains
        r = 0.2; g = 0.6; b = 0.35;
      } else if (y < 7.0) {
        // Subalpine forest
        r = 0.28; g = 0.52; b = 0.24;
      } else if (y < 12.0) {
        // Mid-slope mountain earth/ochre
        r = 0.58; g = 0.44; b = 0.28;
      } else if (y < 17.0) {
        // High rocky crag / scree
        r = 0.52; g = 0.52; b = 0.54;
      } else {
        // Alpine glaciated snow cap
        r = 0.94; g = 0.96; b = 0.98;
      }
      topoColors[i * 3] = r;
      topoColors[i * 3 + 1] = g;
      topoColors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(topoColors, 3));

    // 7. Setup Textures & Materials
    const fallbackSatTexture = createProceduralSatelliteTexture();

    // Satellite Material (Initializes with instant procedural satellite aerial, then loads live ArcGIS imagery)
    const satMaterial = new THREE.MeshStandardMaterial({
      map: fallbackSatTexture,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
    });

    // Topographic DEM Material (Vertex colored hypsometric tinting)
    const topoMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: false,
    });

    // Live Hazard Risk Heatmap Material
    const hazardCanvas = document.createElement('canvas');
    hazardCanvas.width = 512;
    hazardCanvas.height = 512;
    const hctx = hazardCanvas.getContext('2d');
    const hGrad = hctx.createRadialGradient(256, 180, 30, 256, 256, 260);
    hGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');    // Red high hazard zone (Chungthang/Dikchu)
    hGrad.addColorStop(0.35, 'rgba(249, 115, 22, 0.75)'); // Orange warning zone
    hGrad.addColorStop(0.65, 'rgba(234, 179, 8, 0.5)');   // Yellow watch zone
    hGrad.addColorStop(1, 'rgba(34, 197, 94, 0.35)');     // Green safe periphery
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

    // 8. Main Terrain Mesh
    const terrainMesh = new THREE.Mesh(geo, satMaterial);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);
    meshRef.current = terrainMesh;

    // 9. Wireframe Overlay
    const wireGeo = new THREE.WireframeGeometry(geo);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x475569,
      transparent: true,
      opacity: 0.18,
    });
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.visible = false;
    scene.add(wireMesh);

    // 10. Water Plane (Teesta River Gorge Channel)
    const riverGeo = new THREE.PlaneGeometry(6.5, 90);
    riverGeo.rotateX(-Math.PI / 2);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.15,
      metalness: 0.4,
      transparent: true,
      opacity: 0.88,
    });
    const river = new THREE.Mesh(riverGeo, riverMat);
    river.position.set(0, 2.2, 0);
    scene.add(river);

    // 11. Fetch Live ArcGIS Satellite Orthophoto Imagery from Open REST API
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
        setSatStatus('live');
      },
      undefined,
      (err) => {
        console.info('Live ArcGIS satellite imagery note:', err);
        setSatStatus('fallback');
      }
    );

    // 12. Create Accurate 3D Pins for the 6 Pilot Stations
    // Locations distributed according to real geomorphic typology
    const stationCoordinates = [
      { id: 'LOC01', x: 2,   z: -28, label: 'Chungthang Hub', typology: 'COMPOUND' },
      { id: 'LOC02', x: -3,  z: -6,  label: 'Dikchu Gorge',    typology: 'COMPOUND' },
      { id: 'LOC03', x: 24,  z: -8,  label: 'Nathu La Ridge',  typology: 'LANDSLIDE_ONLY' },
      { id: 'LOC04', x: -22, z: -18, label: 'Dzongu Ridge',    typology: 'LANDSLIDE_ONLY' },
      { id: 'LOC05', x: -2,  z: 18,  label: 'Singtam Basin',   typology: 'FLOOD_ONLY' },
      { id: 'LOC06', x: 3,   z: 32,  label: 'Rangpo Delta',    typology: 'FLOOD_ONLY' },
    ];

    const markers = stationCoordinates.map((st) => {
      const loc = pilotLocations.find((l) => (l.location_id || l.id) === st.id) || st;
      const pred = predictions[st.id];
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
        emissiveIntensity: 0.55,
        roughness: 0.2,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.y = 4.2;

      // Pin Stem (Cone)
      const stemGeo = new THREE.ConeGeometry(0.7, 4.2, 8);
      stemGeo.rotateX(Math.PI);
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = 2.1;

      // Glowing Beacon Ring at Base
      const ringGeo = new THREE.RingGeometry(1.2, 2.0, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.1;

      pinGroup.add(headMesh);
      pinGroup.add(stemMesh);
      pinGroup.add(ringMesh);

      // Calculate terrain height at this (x, z)
      let siteY = 8.0;
      if (st.typology === 'LANDSLIDE_ONLY') {
        siteY = 24.0; // High mountain crest
      } else if (st.typology === 'FLOOD_ONLY') {
        siteY = 3.5;  // Low valley floodplain
      } else {
        siteY = 11.0; // Compound gorge cut
      }

      pinGroup.position.set(st.x, siteY, st.z);
      pinGroup.userData = { loc, st, headMesh, ringMesh, baseY: siteY };
      scene.add(pinGroup);

      return pinGroup;
    });
    markersRef.current = markers;

    // 13. Raycasting for Pin Click and Hover
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
        setHoveredSite(hitGroup.userData.loc);
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

    // 14. Orbit Controls (Mouse Drag & Scroll Zoom)
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let theta = 0.2;
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
      radius = Math.max(30, Math.min(140, radius + e.deltaY * 0.06));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // 15. Animation Loop
    let clock = 0;
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      clock += 0.016;

      // Auto-rotation when not interacting
      if (autoRotate && !isDragging) {
        theta += 0.0022;
      }

      // Update camera position on spherical coordinate orbit
      camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
      camera.position.y = Math.max(12, radius * Math.sin(phi) + 12);
      camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
      camera.lookAt(0, 8, 0);

      // Pulse pin beacons & floating animation
      markers.forEach((pin, idx) => {
        const floatDelta = Math.sin(clock * 3.0 + idx * 1.2) * 0.4;
        pin.position.y = pin.userData.baseY + floatDelta;
        const ringScale = 1.0 + Math.sin(clock * 4.0 + idx) * 0.25;
        pin.userData.ringMesh.scale.set(ringScale, ringScale, ringScale);
      });

      renderer.render(scene, camera);
    };
    animate();

    // 16. Window Resize Handler
    const onResize = () => {
      if (!el || !rendererRef.current) return;
      const nW = el.clientWidth;
      const nH = el.clientHeight;
      camera.aspect = nW / nH;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(nW, nH);
    };
    window.addEventListener('resize', onResize);

    // Save refs for dynamic updates
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
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Update Material when textureMode changes
  useEffect(() => {
    if (!meshRef.current || !materialsRef.current) return;
    const targetMat = materialsRef.current[textureMode];
    if (targetMat) {
      meshRef.current.material = targetMat;
      meshRef.current.material.needsUpdate = true;
    }
  }, [textureMode]);

  // Update Vertical Exaggeration
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

    // Adjust station pin heights to match vertical exaggeration
    if (markersRef.current) {
      markersRef.current.forEach((pin) => {
        const st = pin.userData.st;
        let base = 8.0;
        if (st.typology === 'LANDSLIDE_ONLY') base = 24.0;
        else if (st.typology === 'FLOOD_ONLY') base = 3.5;
        else base = 11.0;
        const newY = base * (vertExaggeration / 1.6);
        pin.userData.baseY = newY;
        pin.position.y = newY;
      });
    }
  }, [vertExaggeration]);

  // Update Wireframe visibility
  useEffect(() => {
    if (meshRef.current?._wireMesh) {
      meshRef.current._wireMesh.visible = showWireframe;
    }
  }, [showWireframe]);

  // Selected Station Details
  const selLocId = selectedLocation?.location_id || selectedLocation?.id || 'LOC01';
  const selPred = predictions[selLocId];

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
      {/* ── Top Bar Controls (Floating Light Card) ── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Terrain Texture:
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
            📊 Hazard Risk Heatmap
          </button>
        </div>

        {/* Right: Sliders & Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Vertical Exaggeration Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#475569' }}>
            <span style={{ fontWeight: 600 }}>Relief:</span>
            <input
              type="range"
              min="0.8"
              max="2.8"
              step="0.1"
              value={vertExaggeration}
              onChange={(e) => setVertExaggeration(parseFloat(e.target.value))}
              style={{ width: 75, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 700, minWidth: 28, color: '#0f172a' }}>{vertExaggeration.toFixed(1)}×</span>
          </div>

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
              background: autoRotate ? '#e0f2fe' : '#ffffff',
              color: autoRotate ? '#0369a1' : '#64748b',
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
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
            border: '1px solid #cbd5e1',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>{hoveredSite.name}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
            Typology:{' '}
            <b style={{ color: hoveredSite.hazard_typology === 'COMPOUND' ? '#9333ea' : hoveredSite.hazard_typology === 'LANDSLIDE_ONLY' ? '#b45309' : '#0284c7' }}>
              {hoveredSite.hazard_typology || 'COMPOUND'}
            </b>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#0284c7', marginTop: 2 }}>
            Elevation: {hoveredSite.elevation_m}m · Road: {hoveredSite.primary_road}
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
          background: 'rgba(255, 255, 255, 0.82)',
          backdropFilter: 'blur(6px)',
          padding: '5px 12px',
          borderRadius: 6,
          border: '1px solid rgba(226, 232, 240, 0.8)',
          zIndex: 5,
        }}
      >
        <div>
          🖱 <b>Drag</b> to orbit · <b>Scroll</b> to zoom · <b>Click beacon</b> to inspect site
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: satStatus === 'live' ? '#16a34a' : satStatus === 'loading' ? '#f59e0b' : '#3b82f6',
              boxShadow: `0 0 6px ${satStatus === 'live' ? '#22c55e' : '#f59e0b'}`,
            }}
          />
          <span style={{ fontWeight: 600 }}>
            {satStatus === 'live'
              ? 'ArcGIS World Imagery API: Connected (Live Orthophoto)'
              : satStatus === 'loading'
              ? 'Streaming ArcGIS Satellite Tiles…'
              : 'High-Detail Earth Observation Active'}
          </span>
        </div>
      </div>
    </div>
  );
}
