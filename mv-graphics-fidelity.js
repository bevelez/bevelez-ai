/**
 * mv-graphics-fidelity.js — High-DPI (4096×4096, Anisotropy = 8) True OpenStreetMap
 * Cartographic Light-Table Base Map & 3D Terrain Relief for Mountain View Digital Twin.
 *
 * Implements Milestone M1 / Requirement R1:
 * - High-DPI 4096×4096 anisotropic CanvasTexture (anisotropy = 8, SRGBColorSpace).
 * - Complete Mountain View street hierarchy (2,800+ street segments across all neighborhoods).
 * - Authentic SF Bay salt ponds (A1, A2W, AB2 with 9 inner islands using evenodd, A2E, A3W, A3N),
 *   Charleston Slough, Shoreline Lake, Crittenden Marsh, and Palo Alto Flood Basin.
 * - 95 real city parks in subtle emerald wash.
 * - Moffett Federal Airfield: 61m-wide Runways 14L/32R & 14R/32L with dashed centerlines,
 *   17 taxiways with aviation striping, and 3 aprons.
 * - Mountain View municipal boundary (OSM relation 1544956).
 * - 3D extruded salt pond low-relief pads and levee rims.
 */

(function () {
  'use strict';

  const CANVAS_SIZE = 4096;
  const TABLE_W = 136.0;

  // OSM Cache Data Store
  const osmCache = {
    streets: null,
    infra: null,
    boundary: null,
    loaded: false,
    promise: null
  };

  /**
   * Preload or retrieve cached OpenStreetMap raw datasets asynchronously.
   */
  function preloadOsmCache() {
    if (osmCache.promise) return osmCache.promise;

    const fetchJson = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return await res.json();
    };

    osmCache.promise = Promise.all([
      fetchJson('./data/osm_cache/streets_and_aeroway_raw.json'),
      fetchJson('./data/osm_cache/infrastructure_raw.json'),
      fetchJson('./data/osm_cache/boundary_and_water_raw.json')
    ])
      .then(([streetsData, infraData, boundaryData]) => {
        osmCache.streets = streetsData;
        osmCache.infra = infraData;
        osmCache.boundary = boundaryData;
        osmCache.loaded = true;
        return osmCache;
      })
      .catch((err) => {
        console.error('MVGraphicsFidelity: Failed to load OSM cache:', err);
        throw err;
      });

    return osmCache.promise;
  }

  // Eagerly initiate data fetch
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    preloadOsmCache().catch(() => {});
  }

  /**
   * Resolve a unified (x, z) -> [canvasX, canvasY] projection function
   * that always maps scene coordinates to the 4096×4096 canvas coordinate space.
   */
  function createProjector(toCanvasXY) {
    if (typeof toCanvasXY === 'function') {
      try {
        const testPt = toCanvasXY(0, 0, CANVAS_SIZE);
        if (Array.isArray(testPt) && testPt.length === 2) {
          if (Math.abs(testPt[0] - 2048) < 20) {
            return (x, z) => toCanvasXY(x, z, CANVAS_SIZE);
          }
          if (Math.abs(testPt[0] - 1024) < 20) {
            return (x, z) => {
              const [cx, cy] = toCanvasXY(x, z);
              return [cx * 2, cy * 2];
            };
          }
        }
      } catch (e) {
        // Fall through to standard linear projector
      }
    }
    return (x, z) => [
      ((x / TABLE_W) + 0.5) * CANVAS_SIZE,
      ((z / TABLE_W) + 0.5) * CANVAS_SIZE
    ];
  }

  /**
   * Helper: Stroke a polyline onto 2D canvas context from lat/lon sequence.
   */
  function strokeGeometryPath(ctx, geometry, geoToScene, project) {
    if (!geometry || geometry.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < geometry.length; i++) {
      const pt = geometry[i];
      const sc = geoToScene(pt.lon, pt.lat);
      const [px, py] = project(sc.x, sc.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  /**
   * Helper: Fill and/or stroke a single closed polygon way.
   */
  function drawPolygonWay(ctx, way, geoToScene, project, fillStyle, strokeStyle, lineWidth) {
    if (!way.geometry || way.geometry.length < 3) return;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < way.geometry.length; i++) {
      const pt = way.geometry[i];
      const sc = geoToScene(pt.lon, pt.lat);
      const [px, py] = project(sc.x, sc.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Helper: Draw an OSM multipolygon relation (with outer rings and inner cutout islands)
   * using native ctx.fill('evenodd').
   */
  function drawMultipolygon(ctx, relation, geoToScene, project, fillStyle, strokeStyle, lineWidth) {
    if (!relation || !relation.members) return;
    const outerMembers = relation.members.filter((m) => m.role === 'outer' && m.geometry && m.geometry.length > 2);
    const innerMembers = relation.members.filter((m) => m.role === 'inner' && m.geometry && m.geometry.length > 2);

    ctx.save();
    ctx.beginPath();

    // Outer rings
    outerMembers.forEach((m) => {
      for (let i = 0; i < m.geometry.length; i++) {
        const pt = m.geometry[i];
        const sc = geoToScene(pt.lon, pt.lat);
        const [px, py] = project(sc.x, sc.z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    });

    // Inner island cutout rings
    innerMembers.forEach((m) => {
      for (let i = 0; i < m.geometry.length; i++) {
        const pt = m.geometry[i];
        const sc = geoToScene(pt.lon, pt.lat);
        const [px, py] = project(sc.x, sc.z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    });

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill('evenodd');
    }

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Main 2D Cartographic Rasterization Pipeline.
   * Renders the complete 4096×4096 base map across all 8 strict thematic layers.
   */
  function render4KBaseMap(canvas, ctx, geoToScene, project, data) {
    const streetsElements = (data.streets && data.streets.elements) || [];
    const infraElements = (data.infra && data.infra.elements) || [];
    const boundaryElements = (data.boundary && data.boundary.elements) || [];

    // =========================================================================
    // LAYER 0: DEEP MATTE OBSIDIAN LIGHT-TABLE BASE
    // =========================================================================
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // =========================================================================
    // LAYER 1: SAN FRANCISCO BAY DEEP WATER & ESTUARIAL BASIN
    // =========================================================================
    ctx.save();
    // Northern Bay Water Gradient (Z < -36 scene space -> Y < ~960 canvas px)
    const bayGrad = ctx.createLinearGradient(0, 0, 0, 1150);
    bayGrad.addColorStop(0, '#0c262a');
    bayGrad.addColorStop(0.45, '#10373a');
    bayGrad.addColorStop(0.85, '#0c2428');
    bayGrad.addColorStop(1, '#091519');

    ctx.fillStyle = bayGrad;
    ctx.fillRect(0, 0, CANVAS_SIZE, 1180);

    // Fine stippled bathymetric wave matrix inside Bay waters
    for (let y = 16; y < 1140; y += 24) {
      for (let x = 16; x < CANVAS_SIZE; x += 24) {
        const wave = Math.sin(x * 0.02 + y * 0.015) * Math.cos(y * 0.018 - x * 0.008);
        const distNorm = y / 1140.0;
        const alpha = Math.max(0.04, Math.min(0.26, (1.0 - distNorm) * 0.22 + wave * 0.06));
        ctx.fillStyle = `rgba(124, 242, 214, ${alpha.toFixed(3)})`;
        ctx.fillRect(x, y, 3.2, 3.2);
      }
    }
    ctx.restore();

    // =========================================================================
    // LAYER 2: AUTHENTIC SF BAY SALT PONDS, SLOUGHS & WETLANDS
    // =========================================================================
    const waterRelations = streetsElements.filter((e) => e.type === 'relation');
    const waterWays = streetsElements.filter((e) => e.type === 'way');

    // 2.1 Salt Pond A1 (Relation 442860) — Low salinity mineral turquoise
    const pondA1 = waterRelations.find((e) => e.id === 442860);
    if (pondA1) {
      drawMultipolygon(ctx, pondA1, geoToScene, project, '#13383a', 'rgba(180, 160, 110, 0.45)', 2.4);
    }

    // 2.2 Salt Pond A2W (Relation 442857)
    const pondA2W = waterRelations.find((e) => e.id === 442857);
    if (pondA2W) {
      drawMultipolygon(ctx, pondA2W, geoToScene, project, '#143d40', 'rgba(180, 160, 110, 0.45)', 2.4);
    }

    // 2.3 Salt Pond AB2 (Relation 442855) — 1 outer ring + 9 inner island rings (evenodd cutout)
    const pondAB2 = waterRelations.find((e) => e.id === 442855);
    if (pondAB2) {
      drawMultipolygon(ctx, pondAB2, geoToScene, project, '#102e33', 'rgba(196, 172, 118, 0.50)', 2.2);
    }

    // 2.4 Managed Salt Ponds: A2E (51736707), A3W (51736700), A3N (51736799)
    const pondA2E = waterWays.find((e) => e.id === 51736707);
    if (pondA2E) {
      drawPolygonWay(ctx, pondA2E, geoToScene, project, '#0f292d', 'rgba(196, 172, 118, 0.45)', 2.2);
    }
    const pondA3W = waterWays.find((e) => e.id === 51736700);
    if (pondA3W) {
      drawPolygonWay(ctx, pondA3W, geoToScene, project, '#0e262a', 'rgba(196, 172, 118, 0.45)', 2.2);
    }
    const pondA3N = waterWays.find((e) => e.id === 51736799);
    if (pondA3N) {
      drawPolygonWay(ctx, pondA3N, geoToScene, project, '#0e2528', 'rgba(196, 172, 118, 0.45)', 2.2);
    }

    // 2.5 Charleston Slough (Relation 442859) — Tidal marsh lagoon with 2 inner islands
    const charlestonSlough = waterRelations.find((e) => e.id === 442859) ||
      boundaryElements.find((e) => e.id === 442859);
    if (charlestonSlough) {
      drawMultipolygon(ctx, charlestonSlough, geoToScene, project, '#153c38', 'rgba(165, 185, 140, 0.50)', 2.2);
    }

    // 2.6 Shoreline Lake (Relation 409589) — Sailing and retention reservoir with island
    const shorelineLake = waterRelations.find((e) => e.id === 409589) ||
      boundaryElements.find((e) => e.id === 409589);
    if (shorelineLake) {
      drawMultipolygon(ctx, shorelineLake, geoToScene, project, '#0f2b2e', 'rgba(218, 184, 122, 0.60)', 2.8);
    }

    // 2.7 Crittenden Marsh (Relation 16245178) — 5 outer tidalflat members
    const crittendenMarsh = waterRelations.find((e) => e.id === 16245178);
    if (crittendenMarsh) {
      drawMultipolygon(ctx, crittendenMarsh, geoToScene, project, 'rgba(18, 42, 34, 0.70)', 'rgba(140, 170, 120, 0.40)', 2.0);
    }

    // 2.8 Palo Alto Flood Basin (Way 31536975) — Saltmarsh tidal flat
    const floodBasin = waterWays.find((e) => e.id === 31536975);
    if (floodBasin) {
      drawPolygonWay(ctx, floodBasin, geoToScene, project, 'rgba(17, 38, 32, 0.65)', 'rgba(140, 170, 120, 0.35)', 2.0);
    }

    // 2.9 Golf Course & Local Retention Water Bodies
    const golfWater = boundaryElements.find((e) => e.id === 23630711) || waterWays.find((e) => e.id === 23630711);
    if (golfWater) {
      drawPolygonWay(ctx, golfWater, geoToScene, project, '#0f282a', 'rgba(180, 170, 120, 0.35)', 1.8);
    }
    const caseyForebay = waterWays.find((e) => e.id === 38169183);
    if (caseyForebay) {
      drawPolygonWay(ctx, caseyForebay, geoToScene, project, '#11292c', 'rgba(160, 175, 125, 0.35)', 1.8);
    }

    // =========================================================================
    // LAYER 3: 95 REAL CITY PARKS (leisure=park in subtle emerald wash)
    // =========================================================================
    const parks = infraElements.filter((e) => e.type === 'way' && e.tags && e.tags.leisure === 'park');
    ctx.save();
    ctx.fillStyle = 'rgba(22, 50, 32, 0.42)';
    ctx.strokeStyle = 'rgba(68, 140, 90, 0.38)';
    ctx.lineWidth = 1.8;

    parks.forEach((parkWay) => {
      if (!parkWay.geometry || parkWay.geometry.length < 3) return;
      ctx.beginPath();
      for (let i = 0; i < parkWay.geometry.length; i++) {
        const pt = parkWay.geometry[i];
        const sc = geoToScene(pt.lon, pt.lat);
        const [px, py] = project(sc.x, sc.z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();

    // =========================================================================
    // LAYER 4: MOFFETT FEDERAL AIRFIELD AEROWAYS
    // =========================================================================
    // 4.1 Aprons (Ways 28892364, 31536730, 31536732)
    const aprons = streetsElements.filter((e) => e.type === 'way' && e.tags && e.tags.aeroway === 'apron');
    aprons.forEach((apron) => {
      drawPolygonWay(ctx, apron, geoToScene, project, 'rgba(16, 20, 26, 0.90)', 'rgba(130, 150, 175, 0.30)', 2.0);
    });

    // 4.2 Taxiways (17 ways) with aviation centerline striping
    const taxiways = streetsElements.filter((e) => e.type === 'way' && e.tags && e.tags.aeroway === 'taxiway');
    ctx.save();
    // Taxiway pavement base
    ctx.strokeStyle = '#12161d';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    taxiways.forEach((tw) => strokeGeometryPath(ctx, tw.geometry, geoToScene, project));

    // Taxiway centerline amber stripe
    ctx.strokeStyle = 'rgba(235, 185, 60, 0.45)';
    ctx.lineWidth = 1.2;
    taxiways.forEach((tw) => strokeGeometryPath(ctx, tw.geometry, geoToScene, project));
    ctx.restore();

    // 4.3 Runways: 14L/32R (Way 4338473) & 14R/32L (Way 8141139) at true 61m width (22.5px at 4K)
    const runways = streetsElements.filter((e) => e.type === 'way' && e.tags && e.tags.aeroway === 'runway');
    ctx.save();
    runways.forEach((rw) => {
      if (!rw.geometry || rw.geometry.length < 2) return;

      // Runway asphalt casing (23px wide for 61m true width)
      ctx.save();
      ctx.strokeStyle = '#161b22';
      ctx.lineWidth = 23.0;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      strokeGeometryPath(ctx, rw.geometry, geoToScene, project);
      ctx.restore();

      // Runway white edge lines
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 195, 215, 0.50)';
      ctx.lineWidth = 1.2;
      strokeGeometryPath(ctx, rw.geometry, geoToScene, project);
      ctx.restore();

      // Runway dashed centerline markings
      ctx.save();
      ctx.strokeStyle = 'rgba(235, 240, 252, 0.85)';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'butt';
      ctx.setLineDash([16, 14]);
      strokeGeometryPath(ctx, rw.geometry, geoToScene, project);
      ctx.restore();

      // Runway threshold transverse bar at endpoints
      const p0 = rw.geometry[0];
      const pN = rw.geometry[rw.geometry.length - 1];
      [p0, pN].forEach((thPt) => {
        const sc = geoToScene(thPt.lon, thPt.lat);
        const [tx, ty] = project(sc.x, sc.z);
        ctx.fillStyle = 'rgba(240, 245, 255, 0.90)';
        ctx.fillRect(tx - 6, ty - 6, 12, 12);
      });
    });
    ctx.restore();

    // =========================================================================
    // LAYER 5: COMPLETE MOUNTAIN VIEW STREET GRID HIERARCHY (2,800+ STREETS)
    // =========================================================================
    // Merge street segments from both datasets
    const allStreets = [
      ...streetsElements.filter((e) => e.type === 'way' && e.tags && e.tags.highway),
      ...infraElements.filter((e) => e.type === 'way' && e.tags && e.tags.highway)
    ];

    // Partition streets into hierarchy tiers
    const tiers = {
      activeMobility: [],
      residential: [],
      tertiary: [],
      secondary: [],
      primary: [],
      trunk: [],
      motorway: []
    };

    allStreets.forEach((way) => {
      const hw = way.tags.highway;
      if (['cycleway', 'pedestrian', 'footway', 'path'].includes(hw)) {
        tiers.activeMobility.push(way);
      } else if (['residential', 'unclassified', 'living_street', 'service'].includes(hw)) {
        tiers.residential.push(way);
      } else if (['tertiary', 'tertiary_link'].includes(hw)) {
        tiers.tertiary.push(way);
      } else if (['secondary', 'secondary_link'].includes(hw)) {
        tiers.secondary.push(way);
      } else if (['primary', 'primary_link'].includes(hw)) {
        tiers.primary.push(way);
      } else if (['trunk', 'trunk_link'].includes(hw)) {
        tiers.trunk.push(way);
      } else if (['motorway', 'motorway_link'].includes(hw)) {
        tiers.motorway.push(way);
      }
    });

    // 5.1 Active Mobility (Trails & Paths): Stevens Creek Trail, Downtown pedestrian ways
    ctx.save();
    ctx.strokeStyle = 'rgba(70, 224, 148, 0.28)';
    ctx.lineWidth = 1.4;
    tiers.activeMobility.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // 5.2 Residential / Local Neighborhood Streets (2,000+ segments)
    // Razor-sharp architectural platting across Old MV, Rex Manor, Montaloma, Cuesta Park
    ctx.save();
    ctx.strokeStyle = 'rgba(215, 225, 240, 0.18)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    tiers.residential.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // 5.3 Tertiary Neighborhood Collectors (Middlefield, Cuesta, Miramonte, Del Medio)
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 200, 225, 0.35)';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    tiers.tertiary.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // 5.4 Secondary City Arterials (Castro, Shoreline, Moffett, Grant, Whisman, California)
    ctx.save();
    // Casing
    ctx.strokeStyle = '#070a0e';
    ctx.lineWidth = 5.2;
    ctx.lineCap = 'round';
    tiers.secondary.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    // Core
    ctx.strokeStyle = 'rgba(160, 180, 205, 0.50)';
    ctx.lineWidth = 3.6;
    tiers.secondary.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // 5.5 Primary Boulevard (El Camino Real / State Route 82) — Subtle warm amber commercial tint
    ctx.save();
    ctx.strokeStyle = '#06080c';
    ctx.lineWidth = 7.0;
    ctx.lineCap = 'round';
    tiers.primary.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.strokeStyle = 'rgba(225, 195, 135, 0.55)';
    ctx.lineWidth = 4.8;
    tiers.primary.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // 5.6 Trunk Expressways (Central Expressway)
    ctx.save();
    ctx.strokeStyle = '#06080c';
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    tiers.trunk.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.strokeStyle = 'rgba(175, 190, 215, 0.60)';
    ctx.lineWidth = 5.0;
    tiers.trunk.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // 5.7 Motorway Freeways (US-101 Bayshore & CA-85)
    ctx.save();
    ctx.strokeStyle = '#05070a';
    ctx.lineWidth = 9.0;
    ctx.lineCap = 'round';
    tiers.motorway.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.strokeStyle = 'rgba(140, 200, 240, 0.65)';
    ctx.lineWidth = 6.5;
    tiers.motorway.forEach((way) => strokeGeometryPath(ctx, way.geometry, geoToScene, project));
    ctx.restore();

    // =========================================================================
    // LAYER 6: RIPARIAN CORRIDORS (Stevens Creek, Permanente Creek, Adobe Creek)
    // =========================================================================
    const waterways = infraElements.filter((e) => e.type === 'way' && e.tags && e.tags.waterway);
    if (waterways.length > 0) {
      ctx.save();
      // Channel bed
      ctx.strokeStyle = '#05110a';
      ctx.lineWidth = 14.0;
      ctx.lineCap = 'round';
      waterways.forEach((ww) => strokeGeometryPath(ctx, ww.geometry, geoToScene, project));
      // Braided emerald trail
      ctx.strokeStyle = 'rgba(64, 244, 152, 0.68)';
      ctx.lineWidth = 2.4;
      waterways.forEach((ww) => strokeGeometryPath(ctx, ww.geometry, geoToScene, project));
      ctx.restore();
    }

    // =========================================================================
    // LAYER 7: MOUNTAIN VIEW MUNICIPAL BOUNDARY (Relation 1544956)
    // =========================================================================
    const mvBoundaryRel = boundaryElements.find((e) => e.id === 1544956);
    if (mvBoundaryRel && Array.isArray(mvBoundaryRel.members)) {
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 192, 118, 0.42)';
      ctx.lineWidth = 3.6;
      ctx.setLineDash([18, 10]);

      mvBoundaryRel.members.forEach((m) => {
        if (m.type === 'way' && m.geometry && m.geometry.length > 1) {
          strokeGeometryPath(ctx, m.geometry, geoToScene, project);
        }
      });
      ctx.restore();
    }
  }

  /**
   * Generates a 4096×4096 CanvasTexture uploaded to WebGL with anisotropy = 8.
   * Returns a THREE.CanvasTexture compatible synchronously and asynchronously.
   */
  function generate4KTableSurfaceTexture(geoToScene, toCanvasXY, customTHREE) {
    const THREE = customTHREE || (typeof window !== 'undefined' ? window.THREE : null);
    if (!THREE) {
      throw new Error('MVGraphicsFidelity: THREE instance required to create CanvasTexture.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');

    // Initial matte obsidian base so the texture is immediately valid
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;

    const project = createProjector(toCanvasXY);

    // Asynchronously render full OSM dataset when loaded
    const renderPromise = preloadOsmCache()
      .then((data) => {
        render4KBaseMap(canvas, ctx, geoToScene, project, data);
        tex.needsUpdate = true;
        return tex;
      })
      .catch((err) => {
        console.warn('MVGraphicsFidelity: Render warning, using fallback base:', err);
        return tex;
      });

    // Provide Promise interface for await callers via tex.ready
    tex.ready = renderPromise;

    return tex;
  }

  /**
   * Builds extruded 3D relief pads for authentic SF Bay salt ponds and levees.
   * Replaces synthetic MARSH_ISLANDS_WORLD Catmull-Rom splines with true OSM polygons.
   */
  async function buildAuthenticSaltPondRelief(cityRoot, geoToScene, customTHREE) {
    const THREE = customTHREE || (typeof window !== 'undefined' ? window.THREE : null);
    if (!THREE || !cityRoot || typeof geoToScene !== 'function') {
      console.warn('MVGraphicsFidelity.buildAuthenticSaltPondRelief: missing parameters.');
      return;
    }

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

    // Ensure OSM data is loaded
    const data = await preloadOsmCache();
    const streetsElements = (data.streets && data.streets.elements) || [];
    const boundaryElements = (data.boundary && data.boundary.elements) || [];

    // Target salt pond polygons to extrude
    const targetPolygons = [];

    // 1. Salt Pond A1 (Rel 442860)
    const relA1 = streetsElements.find((e) => e.id === 442860);
    if (relA1) targetPolygons.push(relA1);

    // 2. Salt Pond A2W (Rel 442857)
    const relA2W = streetsElements.find((e) => e.id === 442857);
    if (relA2W) targetPolygons.push(relA2W);

    // 3. Salt Pond AB2 (Rel 442855 with 9 inner island holes)
    const relAB2 = streetsElements.find((e) => e.id === 442855);
    if (relAB2) targetPolygons.push(relAB2);

    // 4. Managed Salt Ponds: A2E (51736707), A3W (51736700), A3N (51736799)
    [51736707, 51736700, 51736799, 31536975].forEach((wid) => {
      const w = streetsElements.find((e) => e.id === wid);
      if (w) targetPolygons.push(w);
    });

    // 5. Charleston Slough (Rel 442859) & Shoreline Lake (Rel 409589)
    [442859, 409589].forEach((rid) => {
      const r = streetsElements.find((e) => e.id === rid) || boundaryElements.find((e) => e.id === rid);
      if (r) targetPolygons.push(r);
    });

    // Construct 3D extrusions
    targetPolygons.forEach((entity) => {
      let outerRings = [];
      let innerRings = [];

      if (entity.type === 'relation') {
        const outers = (entity.members || []).filter((m) => m.role === 'outer' && m.geometry && m.geometry.length > 2);
        const inners = (entity.members || []).filter((m) => m.role === 'inner' && m.geometry && m.geometry.length > 2);
        outers.forEach((m) => outerRings.push(m.geometry));
        inners.forEach((m) => innerRings.push(m.geometry));
      } else if (entity.geometry && entity.geometry.length > 2) {
        outerRings.push(entity.geometry);
      }

      outerRings.forEach((outer) => {
        try {
          const shape = new THREE.Shape();
          outer.forEach((pt, idx) => {
            const sc = geoToScene(pt.lon, pt.lat);
            if (idx === 0) shape.moveTo(sc.x, -sc.z);
            else shape.lineTo(sc.x, -sc.z);
          });
          shape.closePath();

          // Add inner island cutout holes
          innerRings.forEach((inner) => {
            const hole = new THREE.Path();
            inner.forEach((pt, idx) => {
              const sc = geoToScene(pt.lon, pt.lat);
              if (idx === 0) hole.moveTo(sc.x, -sc.z);
              else hole.lineTo(sc.x, -sc.z);
            });
            hole.closePath();
            shape.holes.push(hole);
          });

          const extGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.065,
            bevelEnabled: false
          });
          extGeo.rotateX(-Math.PI / 2);

          const mesh = new THREE.Mesh(extGeo, marshMat);
          mesh.position.y = -0.17;
          mesh.receiveShadow = true;
          cityRoot.add(mesh);

          // Levee perimeter rim line
          const rimPts = outer.map((pt) => {
            const sc = geoToScene(pt.lon, pt.lat);
            return new THREE.Vector3(sc.x, -0.09, sc.z);
          });
          rimPts.push(rimPts[0].clone());
          const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPts);
          cityRoot.add(new THREE.Line(rimGeo, rimMat));

          // Inner island levee rim lines
          innerRings.forEach((inner) => {
            const innerRimPts = inner.map((pt) => {
              const sc = geoToScene(pt.lon, pt.lat);
              return new THREE.Vector3(sc.x, -0.09, sc.z);
            });
            innerRimPts.push(innerRimPts[0].clone());
            const innerRimGeo = new THREE.BufferGeometry().setFromPoints(innerRimPts);
            cityRoot.add(new THREE.Line(innerRimGeo, rimMat));
          });
        } catch (err) {
          // Skip degenerate polygon if any
        }
      });
    });
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.MVGraphicsFidelity = {
      preload: preloadOsmCache,
      generate4KTableSurfaceTexture,
      buildAuthenticSaltPondRelief
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      preload: preloadOsmCache,
      generate4KTableSurfaceTexture,
      buildAuthenticSaltPondRelief
    };
  }
})();
