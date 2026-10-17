/**
 * mv-graphics-fidelity.js — High-DPI (4096×4096, Anisotropy = 8) True OpenStreetMap
 * Cartographic Light-Table Base Map & 3D Terrain Relief for Mountain View Digital Twin.
 *
 * Uses pre-rasterized ./assets/mv-basemap-4k.png?v=8 (generated offline from OpenStreetMap
 * Overpass caches via scripts/export_basemap_png.py) and reads salt-pond / slough polygons
 * (including inner island cutout holes) directly from mvGisData.water so zero raw Overpass
 * cache dumps (data/osm_cache/*.json) are fetched at runtime.
 */

const CANVAS_SIZE = 4096;
const BASEMAP_ASSET_URL = './assets/mv-basemap-4k.png?v=8';

/**
 * Compatibility stub for legacy callers expecting preload().
 * Resolves immediately without fetching raw Overpass cache files.
 */
export function preloadOsmCache() {
  return Promise.resolve({ loaded: true, source: BASEMAP_ASSET_URL });
}

/**
 * Generates a 4096×4096 CanvasTexture uploaded to WebGL with anisotropy = 8
 * by loading the pre-rasterized ./assets/mv-basemap-4k.png?v=8 image.
 */
export function generate4KTableSurfaceTexture(geoToScene, toCanvasXY, customTHREE) {
  const THREE = customTHREE || (typeof window !== 'undefined' ? window.THREE : null);
  if (!THREE) {
    throw new Error('MVGraphicsFidelity: THREE instance required to create CanvasTexture.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  // Immediate matte obsidian base before the 4K PNG finishes decoding
  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;

  const renderPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      tex.needsUpdate = true;
      if (typeof window !== 'undefined' && window.MountainViewTwin && window.MountainViewTwin.requestShadowUpdate) {
        window.MountainViewTwin.requestShadowUpdate();
      }
      resolve(tex);
    };
    img.onerror = (err) => {
      console.warn('MVGraphicsFidelity: Failed to load pre-rasterized 4K base map PNG:', err);
      resolve(tex);
    };
    img.src = BASEMAP_ASSET_URL;
  });

  tex.ready = renderPromise;
  return tex;
}

/**
 * Helper to merge an array of BufferGeometries into a single BufferGeometry
 * so all salt pond extrusions render in 1 draw call instead of 15+ separate draw calls.
 */
function mergeBufferGeometriesSimple(geometries, THREE) {
  const valid = geometries.filter((g) => g && g.attributes && g.attributes.position);
  if (!valid.length) return null;

  let totalVerts = 0;
  for (const g of valid) {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    totalVerts += nonIdx.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;

  for (const rawG of valid) {
    const g = rawG.index ? rawG.toNonIndexed() : rawG;
    const pos = g.attributes.position.array;
    positions.set(pos, offset);
    if (g.attributes.normal) {
      normals.set(g.attributes.normal.array, offset);
    }
    offset += pos.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}

/**
 * Builds extruded 3D relief pads for authentic SF Bay salt ponds, sloughs, and levees
 * directly from mvGisData.water (zero raw Overpass JSON cache fetches), merged into
 * a single Mesh and a single LineSegments for minimal draw calls.
 */
export async function buildAuthenticSaltPondRelief(cityRoot, geoToScene, customTHREE, gisDataArg) {
  const THREE = customTHREE || (typeof window !== 'undefined' ? window.THREE : null);
  if (!THREE || !cityRoot || typeof geoToScene !== 'function') {
    return;
  }

  const gisData = gisDataArg || (typeof window !== 'undefined' ? window.mvGisData : null);
  const waterList = (gisData && Array.isArray(gisData.water)) ? gisData.water : [];
  if (!waterList.length) return;

  const marshMat = new THREE.MeshStandardMaterial({
    color: 0x0c1418,
    roughness: 0.86,
    metalness: 0.08
  });

  const rimMat = new THREE.LineBasicMaterial({
    color: 0x9c885e,
    transparent: true,
    opacity: 0.48
  });

  const targetIds = new Set([
    'w_salt_pond_a1',
    'w_salt_pond_a2w',
    'w_salt_pond_ab2',
    'w_salt_pond_a2e',
    'w_salt_pond_a3w',
    'w_salt_pond_a3n',
    'w_palo_alto_flood_basin',
    'w_charleston_slough',
    'w_shoreline_lake'
  ]);

  const extrudedGeoms = [];
  const rimSegmentCoords = [];

  for (const wf of waterList) {
    if (!targetIds.has(wf.id) || !Array.isArray(wf.polygon) || wf.polygon.length < 3) continue;
    try {
      const outer = wf.polygon;
      const shape = new THREE.Shape();
      outer.forEach((pt, idx) => {
        const lon = Array.isArray(pt) ? pt[0] : pt.lon;
        const lat = Array.isArray(pt) ? pt[1] : pt.lat;
        const sc = geoToScene(lon, lat);
        if (idx === 0) shape.moveTo(sc.x, -sc.z);
        else shape.lineTo(sc.x, -sc.z);
      });
      shape.closePath();

      const holes = Array.isArray(wf.holes) ? wf.holes : [];
      holes.forEach((inner) => {
        if (!Array.isArray(inner) || inner.length < 3) return;
        const holePath = new THREE.Path();
        inner.forEach((pt, idx) => {
          const lon = Array.isArray(pt) ? pt[0] : pt.lon;
          const lat = Array.isArray(pt) ? pt[1] : pt.lat;
          const sc = geoToScene(lon, lat);
          if (idx === 0) holePath.moveTo(sc.x, -sc.z);
          else holePath.lineTo(sc.x, -sc.z);
        });
        holePath.closePath();
        shape.holes.push(holePath);
      });

      const extGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.065,
        bevelEnabled: false
      });
      extGeo.rotateX(-Math.PI / 2);
      extGeo.translate(0, -0.17, 0);
      extrudedGeoms.push(extGeo);

      const addRingSegments = (ring) => {
        for (let i = 0; i < ring.length; i++) {
          const p0 = ring[i];
          const p1 = ring[(i + 1) % ring.length];
          const s0 = geoToScene(Array.isArray(p0) ? p0[0] : p0.lon, Array.isArray(p0) ? p0[1] : p0.lat);
          const s1 = geoToScene(Array.isArray(p1) ? p1[0] : p1.lon, Array.isArray(p1) ? p1[1] : p1.lat);
          rimSegmentCoords.push(s0.x, -0.09, s0.z, s1.x, -0.09, s1.z);
        }
      };

      addRingSegments(outer);
      holes.forEach((inner) => {
        if (Array.isArray(inner) && inner.length >= 3) addRingSegments(inner);
      });
    } catch (_err) {
      // Skip degenerate polygon if any
    }
  }

  const mergedMeshGeo = mergeBufferGeometriesSimple(extrudedGeoms, THREE);
  if (mergedMeshGeo) {
    const mesh = new THREE.Mesh(mergedMeshGeo, marshMat);
    mesh.name = 'SaltPondReliefMerged';
    mesh.receiveShadow = true;
    cityRoot.add(mesh);
  }

  if (rimSegmentCoords.length >= 6) {
    const rimGeo = new THREE.BufferGeometry();
    rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimSegmentCoords, 3));
    const rimLines = new THREE.LineSegments(rimGeo, rimMat);
    rimLines.name = 'SaltPondLeveeRimsMerged';
    cityRoot.add(rimLines);
  }
}

export const MVGraphicsFidelity = {
  preload: preloadOsmCache,
  generate4KTableSurfaceTexture,
  buildAuthenticSaltPondRelief
};

if (typeof window !== 'undefined') {
  window.MVGraphicsFidelity = MVGraphicsFidelity;
}
