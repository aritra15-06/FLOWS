/**
 * FLOWS — Live Hydrological River & Drainage 3D Engine
 * Converts real-time OpenStreetMap waterways into dynamic 3D river meshes
 * with map-calibrated widths, hydraulic elevation gradient flow orientation,
 * and terrain canyon carving.
 */

export const BBOX = {
  minLat: 27.10,
  maxLat: 27.75,
  minLng: 88.35,
  maxLng: 88.85,
};

export const PLANE_SIZE = 90;

export function geoTo3D(lat, lng) {
  const normX = (lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng);
  const normZ = (BBOX.maxLat - lat) / (BBOX.maxLat - BBOX.minLat);
  const x = (normX - 0.5) * PLANE_SIZE;
  const z = (normZ - 0.5) * PLANE_SIZE;
  return { x, z, normX, normZ, lat, lng };
}

export function threeToGeo(x, z) {
  const normX = x / PLANE_SIZE + 0.5;
  const normZ = z / PLANE_SIZE + 0.5;
  const lng = BBOX.minLng + normX * (BBOX.maxLng - BBOX.minLng);
  const lat = BBOX.maxLat - normZ * (BBOX.maxLat - BBOX.minLat);
  return { lat, lng };
}

export function sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev) {
  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedZ = Math.max(0, Math.min(1, normZ));
  const col = Math.min(gridSize - 1, Math.floor(clampedX * (gridSize - 1)));
  const row = Math.min(gridSize - 1, Math.floor(clampedZ * (gridSize - 1)));
  const idx = row * gridSize + col;
  const hMeters = elevations && elevations[idx] !== undefined ? elevations[idx] : 1200;
  const normH = (hMeters - minElev) / Math.max(1, maxElev - minElev);
  const yWorld = normH * 22.0 + 1.2;
  return { hMeters, yWorld, normH };
}

export function dist2D(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

export function distToPolyline(px, pz, polyline3D) {
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

/**
 * Calculates physically accurate river width from OSM hierarchy, latitude, and elevation.
 * Lower valley reaches (Rangpo, Melli, Teesta Bazar) are significantly broader
 * than high-altitude mountain gorges (Chungthang, Lachen).
 */
export function getRiverHalfWidth(riverName, lat, hMeters) {
  const name = (riverName || "").toLowerCase();
  const isTeestaTrunk = name.includes("teesta") || name.includes("tista");
  const isMajorTributary =
    name.includes("rangit") ||
    name.includes("rangpo") ||
    name.includes("lachen") ||
    name.includes("lachung") ||
    name.includes("rani") ||
    name.includes("dikchu");

  if (isTeestaTrunk) {
    if (hMeters < 500 || lat < 27.25) {
      // Wide southern braided flood corridor (Rangpo past Melli to Teesta Bazar)
      return 1.65;
    } else if (hMeters < 1200 || lat < 27.45) {
      // Middle valley corridor (Singtam to Dikchu)
      return 1.05;
    } else {
      // Upper mountain canyon (Chungthang / Mangan gorge)
      return 0.65;
    }
  } else if (isMajorTributary) {
    if (hMeters < 750) {
      return 0.85; // Near confluence with Teesta
    } else {
      return 0.48; // High mountain tributary reach
    }
  } else {
    // Secondary streams, rivulets, and mountain kholas
    return 0.32;
  }
}

/**
 * Parses raw waterways from OSM, filters to 3D bounding box,
 * orients in downhill hydraulic flow direction, and assigns dynamic widths.
 */
export function processLiveWaterways(
  rawWaterways,
  elevations,
  gridSize,
  minElev,
  maxElev
) {
  if (!rawWaterways || rawWaterways.length === 0) return [];

  const processed = [];

  rawWaterways.forEach((river) => {
    const rawPts = river.points || [];
    if (rawPts.length < 2) return;

    // Filter points to Sikkim 3D Bounding Box (with a generous border margin)
    const ptsInBox = [];
    rawPts.forEach((pt) => {
      const lat = pt[0];
      const lng = pt[1];
      if (
        lat >= BBOX.minLat - 0.04 &&
        lat <= BBOX.maxLat + 0.04 &&
        lng >= BBOX.minLng - 0.04 &&
        lng <= BBOX.maxLng + 0.04
      ) {
        const p3d = geoTo3D(lat, lng);
        const elev = sampleSatelliteElevation(
          p3d.normX,
          p3d.normZ,
          elevations,
          gridSize,
          minElev,
          maxElev
        );
        p3d.hMeters = elev.hMeters;
        p3d.yWorld = elev.yWorld;
        p3d.width = getRiverHalfWidth(river.name, lat, elev.hMeters);
        ptsInBox.push(p3d);
      }
    });

    if (ptsInBox.length < 2) return;

    // Downsample very dense segments slightly for smooth 60fps performance
    let step = 1;
    if (ptsInBox.length > 80) step = 2;
    if (ptsInBox.length > 180) step = 3;

    const filtered = [];
    for (let k = 0; k < ptsInBox.length; k += step) {
      filtered.push(ptsInBox[k]);
    }
    if (filtered[filtered.length - 1] !== ptsInBox[ptsInBox.length - 1]) {
      filtered.push(ptsInBox[ptsInBox.length - 1]);
    }

    if (filtered.length < 2) return;

    // Hydraulic Flow Orientation: water always flows from high elevation to low elevation.
    // If start is lower than end, reverse points so index 0 is upstream (higher) and end is downstream (lower).
    const startH = filtered[0].hMeters;
    const endH = filtered[filtered.length - 1].hMeters;
    if (startH < endH) {
      filtered.reverse();
    }

    processed.push({
      id: river.id || `river-${Math.random()}`,
      name: river.name || "Live OSM Waterway",
      points: filtered,
      nearLocationId: river.nearLocationId || null,
      isDownstreamTeesta: Boolean(river.isDownstreamTeesta),
    });
  });

  return processed;
}

/**
 * Builds 3D ribbon BufferGeometries for all live OSM rivers in the scene.
 */
export function buildLiveRiverMeshes(
  processedRivers,
  vertExaggeration,
  normalWaterTex,
  floodWaterTex,
  hasFloodSurge,
  THREE
) {
  const riverGroup = new THREE.Group();
  riverGroup.name = "LiveOSMRiverNetwork";
  const riverMeshes = [];

  const waterMaterial = new THREE.MeshStandardMaterial({
    map: hasFloodSurge ? floodWaterTex : normalWaterTex,
    transparent: true,
    opacity: 0.94,
    roughness: 0.18,
    metalness: 0.65,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  processedRivers.forEach((river) => {
    const pts = river.points;
    const count = pts.length;
    if (count < 2) return;

    const riverGeo = new THREE.BufferGeometry();
    const riverVerts = new Float32Array(count * 2 * 3);
    const riverUVs = new Float32Array(count * 2 * 2);
    const riverIndices = [];

    let accumDistance = 0;

    for (let i = 0; i < count; i++) {
      const pt = pts[i];
      // Elevate slightly above the carved canyon bed to avoid z-fighting
      const ry = Math.max(1.0, (pt.yWorld - 1.15) * vertExaggeration);

      let tx = 0,
        tz = 1;
      if (i < count - 1) {
        const next = pts[i + 1];
        const prev = i > 0 ? pts[i - 1] : pt;
        tx = next.x - prev.x;
        tz = next.z - prev.z;
        const len = Math.hypot(tx, tz) || 1;
        tx /= len;
        tz /= len;
        if (i > 0) accumDistance += Math.hypot(pt.x - prev.x, pt.z - prev.z);
      } else {
        const prev = pts[i - 1];
        tx = pt.x - prev.x;
        tz = pt.z - prev.z;
        const len = Math.hypot(tx, tz) || 1;
        tx /= len;
        tz /= len;
        accumDistance += Math.hypot(pt.x - prev.x, pt.z - prev.z);
      }

      // Perpendicular normal to tangent
      const nx = -tz;
      const nz = tx;
      const halfWidth = pt.width;

      const lx = pt.x - nx * halfWidth;
      const lz = pt.z - nz * halfWidth;
      const rx = pt.x + nx * halfWidth;
      const rz = pt.z + nz * halfWidth;

      const vIdx = i * 2;
      riverVerts[vIdx * 3] = lx;
      riverVerts[vIdx * 3 + 1] = ry;
      riverVerts[vIdx * 3 + 2] = lz;

      riverVerts[(vIdx + 1) * 3] = rx;
      riverVerts[(vIdx + 1) * 3 + 1] = ry;
      riverVerts[(vIdx + 1) * 3 + 2] = rz;

      // UV coordinates oriented along flow
      riverUVs[vIdx * 2] = 0;
      riverUVs[vIdx * 2 + 1] = accumDistance * 0.18;

      riverUVs[(vIdx + 1) * 2] = 1;
      riverUVs[(vIdx + 1) * 2 + 1] = accumDistance * 0.18;

      if (i < count - 1) {
        const a = vIdx;
        const b = vIdx + 1;
        const c = vIdx + 2;
        const d = vIdx + 3;
        riverIndices.push(a, b, c);
        riverIndices.push(b, d, c);
      }
    }

    riverGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(riverVerts, 3)
    );
    riverGeo.setAttribute("uv", new THREE.BufferAttribute(riverUVs, 2));
    riverGeo.setIndex(riverIndices);
    riverGeo.computeVertexNormals();
    riverGeo.computeBoundingSphere();
    riverGeo.computeBoundingBox();

    const mesh = new THREE.Mesh(riverGeo, waterMaterial);
    mesh.receiveShadow = true;
    mesh.name = river.name;
    mesh.userData = {
      riverId: river.id,
      riverName: river.name,
      baseY: new Float32Array(count * 2),
    };

    // Store base unexaggerated Y for dynamic relief updates
    for (let k = 0; k < count * 2; k++) {
      mesh.userData.baseY[k] = riverVerts[k * 3 + 1] / Math.max(0.1, vertExaggeration);
    }

    riverGroup.add(mesh);
    riverMeshes.push(mesh);
  });

  return { riverGroup, riverMeshes };
}
