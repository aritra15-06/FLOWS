/**
 * FLOWS — Live Hydrological River & Drainage 3D Engine
 * Converts real-time OpenStreetMap waterways into dynamic 3D river meshes
 * with map-calibrated widths, strict hydraulic downhill flow gradient conditioning,
 * and physically realistic flat riverbed & valley floor carving.
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

/**
 * Bilinear interpolation of satellite elevation matrix.
 * Smooths across discrete DEM pixels to prevent staircasing.
 */
export function sampleSatelliteElevation(normX, normZ, elevations, gridSize, minElev, maxElev) {
  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedZ = Math.max(0, Math.min(1, normZ));
  if (!elevations || elevations.length === 0) {
    return { hMeters: 1200, yWorld: 10.0, normH: 0.4 };
  }
  const gx = clampedX * (gridSize - 1);
  const gz = clampedZ * (gridSize - 1);
  const col0 = Math.floor(gx);
  const col1 = Math.min(gridSize - 1, col0 + 1);
  const row0 = Math.floor(gz);
  const row1 = Math.min(gridSize - 1, row0 + 1);
  const fx = gx - col0;
  const fz = gz - row0;

  const h00 = elevations[row0 * gridSize + col0] ?? minElev;
  const h10 = elevations[row0 * gridSize + col1] ?? minElev;
  const h01 = elevations[row1 * gridSize + col0] ?? minElev;
  const h11 = elevations[row1 * gridSize + col1] ?? minElev;

  const hTop = h00 * (1 - fx) + h10 * fx;
  const hBot = h01 * (1 - fx) + h11 * fx;
  const hMeters = hTop * (1 - fz) + hBot * fz;

  const normH = Math.max(0, Math.min(1, (hMeters - minElev) / Math.max(1, maxElev - minElev)));
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
 * Enforces strict hydraulic downhill flow and removes DEM sampling noise / rollercoaster spikes.
 * Water physically cannot climb uphill. Every successive downstream point is strictly <= previous point.
 */
export function conditionMonotonicRiverProfile(points) {
  const n = points.length;
  if (n < 2) return points;

  // Cumulative distance along the reach
  const dists = [0];
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    dists.push(dists[i - 1] + Math.max(0.01, d));
  }
  const totalLen = dists[n - 1];

  const startY = points[0].yWorld;
  const endY = points[n - 1].yWorld;
  const netDrop = Math.max(0.2, startY - endY);
  const minSlope = (netDrop / Math.max(1, totalLen)) * 0.4;

  const h = points.map((p) => p.yWorld);

  // Forward pass: water must descend monotonically
  for (let i = 1; i < n; i++) {
    const stepDist = dists[i] - dists[i - 1];
    const maxAllowed = h[i - 1] - minSlope * stepDist;
    h[i] = Math.min(maxAllowed, h[i]);
  }

  // Backward pass: prevent premature drop below downstream target
  for (let i = n - 2; i >= 0; i--) {
    const stepDist = dists[i + 1] - dists[i];
    const minRequired = h[i + 1] + minSlope * stepDist;
    h[i] = Math.max(h[i], minRequired);
  }

  // 3-point monotonic smoothing
  const smoothed = [...h];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 1; i++) {
      smoothed[i] = 0.2 * smoothed[i - 1] + 0.6 * smoothed[i] + 0.2 * smoothed[i + 1];
    }
  }

  for (let i = 0; i < n; i++) {
    points[i].yWorld = smoothed[i];
  }
  return points;
}

/**
 * Parses raw waterways from OSM, filters to 3D bounding box,
 * orients in downhill hydraulic flow direction, applies monotonic slope conditioning,
 * and assigns dynamic widths.
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

    // Hydraulic Flow Orientation: water always flows from high mountain elevation to low valley outlet.
    // If start is lower than end, reverse points so index 0 is upstream (higher) and end is downstream (lower).
    const startH = filtered[0].hMeters;
    const endH = filtered[filtered.length - 1].hMeters;
    if (startH < endH) {
      filtered.reverse();
    }

    // Condition strictly monotonic downhill profile (no rollercoasters or mountain-climbing)
    conditionMonotonicRiverProfile(filtered);

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
 * Fast spatial binning grid for 3D valley flattening across 5,329 terrain vertices.
 */
export function buildValleySpatialIndex(processedRivers) {
  const GRID_CELLS = 16;
  const CELL_SIZE = PLANE_SIZE / GRID_CELLS;
  const grid = Array.from({ length: GRID_CELLS * GRID_CELLS }, () => []);

  if (!processedRivers || processedRivers.length === 0) {
    return { grid: [], GRID_CELLS, CELL_SIZE, hasRivers: false };
  }

  processedRivers.forEach((river) => {
    const pts = river.points;
    for (let k = 0; k < pts.length - 1; k++) {
      const p1 = pts[k];
      const p2 = pts[k + 1];
      const canyonMargin = (p1.width || 0.6) + 4.5;
      const minX = Math.min(p1.x, p2.x) - canyonMargin;
      const maxX = Math.max(p1.x, p2.x) + canyonMargin;
      const minZ = Math.min(p1.z, p2.z) - canyonMargin;
      const maxZ = Math.max(p1.z, p2.z) + canyonMargin;

      const startGX = Math.max(0, Math.floor((minX + PLANE_SIZE / 2) / CELL_SIZE));
      const endGX = Math.min(GRID_CELLS - 1, Math.floor((maxX + PLANE_SIZE / 2) / CELL_SIZE));
      const startGZ = Math.max(0, Math.floor((minZ + PLANE_SIZE / 2) / CELL_SIZE));
      const endGZ = Math.min(GRID_CELLS - 1, Math.floor((maxZ + PLANE_SIZE / 2) / CELL_SIZE));

      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lenSq = dx * dx + dz * dz;
      const seg = {
        p1,
        p2,
        dx,
        dz,
        lenSq: lenSq === 0 ? 1e-6 : lenSq,
        width: p1.width || 0.6,
      };

      for (let gx = startGX; gx <= endGX; gx++) {
        for (let gz = startGZ; gz <= endGZ; gz++) {
          grid[gz * GRID_CELLS + gx].push(seg);
        }
      }
    }
  });

  return { grid, GRID_CELLS, CELL_SIZE, hasRivers: true };
}

/**
 * Hydrologically flattens the riverbed and alluvial valley floor along live rivers.
 * Guarantees that rivers sit in realistic flat valleys and do not climb up mountains.
 */
export function carveValleyElevation(vx, vz, naturalYWorld, valleyIndex) {
  if (!valleyIndex || !valleyIndex.hasRivers) return naturalYWorld;

  const { grid, GRID_CELLS, CELL_SIZE } = valleyIndex;
  const gx = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor((vx + PLANE_SIZE / 2) / CELL_SIZE)));
  const gz = Math.max(0, Math.min(GRID_CELLS - 1, Math.floor((vz + PLANE_SIZE / 2) / CELL_SIZE)));
  const bucket = grid[gz * GRID_CELLS + gx];

  if (!bucket || bucket.length === 0) return naturalYWorld;

  let closestDist = Infinity;
  let closestRiverY = 0;
  let closestWidth = 0.6;

  for (let i = 0; i < bucket.length; i++) {
    const seg = bucket[i];
    const t = Math.max(0, Math.min(1, ((vx - seg.p1.x) * seg.dx + (vz - seg.p1.z) * seg.dz) / seg.lenSq));
    const projX = seg.p1.x + t * seg.dx;
    const projZ = seg.p1.z + t * seg.dz;
    const d = Math.hypot(vx - projX, vz - projZ);
    if (d < closestDist) {
      closestDist = d;
      closestRiverY = seg.p1.yWorld + t * (seg.p2.yWorld - seg.p1.yWorld);
      closestWidth = seg.width;
    }
  }

  const wChannel = closestWidth;
  const wPlain = closestWidth + 1.3; // Flat alluvial valley floor
  const wCanyon = wPlain + 2.8;     // Canyon wall slope

  if (closestDist <= wChannel) {
    // Exactly in the flat river channel bed: flat cross section, 0.12 units beneath water surface
    const flatBed = closestRiverY - 0.12;
    return Math.min(naturalYWorld, flatBed);
  } else if (closestDist <= wPlain) {
    // In the flat alluvial valley floodplain terrace
    const plainOffset = (closestDist - wChannel) * 0.12;
    const targetY = closestRiverY - 0.12 + plainOffset;
    return Math.min(naturalYWorld, targetY);
  } else if (closestDist < wCanyon) {
    // Smooth valley wall transition ascending to mountains
    const plainEdge = closestRiverY - 0.12 + 1.3 * 0.12;
    const t = (closestDist - wPlain) / (wCanyon - wPlain);
    const s = t * t * (3 - 2 * t);
    const targetY = plainEdge * (1 - s) + naturalYWorld * s;
    return Math.min(naturalYWorld, targetY);
  }

  return naturalYWorld;
}

/**
 * Builds 3D ribbon BufferGeometries for all live OSM rivers in the scene.
 */
export function buildLiveRiverMeshes(
  processedRivers,
  vertExaggeration,
  normalWaterTex,
  ...rest
) {
  const THREE = rest.find((r) => r && r.Group) || rest[rest.length - 1];
  const riverGroup = new THREE.Group();
  riverGroup.name = "LiveOSMRiverNetwork";
  const riverMeshes = [];

  const waterMaterial = new THREE.MeshStandardMaterial({
    map: normalWaterTex,
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
      // River water surface elevation
      const ry = Math.max(0.5, pt.yWorld * vertExaggeration);

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
      mesh.userData.baseY[k] = pts[Math.floor(k / 2)].yWorld;
    }

    riverGroup.add(mesh);
    riverMeshes.push(mesh);
  });

  return { riverGroup, riverMeshes };
}
