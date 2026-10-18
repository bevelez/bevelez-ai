// Extrudes the 8,010 OpenStreetMap footprints from assets/mountain-view-gis.json into one
// batched Cesium primitive (dark slate, shaded by the scene light). Used when no Google
// 3D Tiles key is present.

const C = window.Cesium;

const LANDMARK_TINT = C.Color.fromCssColorString('#4a5b7a');

function colorForHeight(h, isLandmark) {
  if (isLandmark) return LANDMARK_TINT;
  // 3 m → #1c2330, 60 m → #3a4a66
  const t = Math.max(0, Math.min(1, (h - 3) / 57));
  const r = Math.round(28 + t * 30);
  const g = Math.round(35 + t * 39);
  const b = Math.round(48 + t * 54);
  return C.Color.fromBytes(r, g, b, 255);
}

export async function loadBuildings(viewer, url = './assets/mountain-view-gis.json?v=8') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GIS bundle ${res.status}`);
  const gis = await res.json();
  const instances = [];
  const index = new Map();

  for (const b of gis.buildings) {
    const poly = b.polygon;
    if (!poly || poly.length < 3) continue;
    const flat = [];
    for (const [lon, lat] of poly) flat.push(lon, lat);
    const h = Math.max(3, Math.min(120, Number(b.height_m) || 4));
    const isLandmark = b.height_source === 'landmark_override' || /Hangar|Amphitheat|Bay View|Library|City Hall/i.test(b.name || '');
    try {
      instances.push(new C.GeometryInstance({
        geometry: new C.PolygonGeometry({
          polygonHierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(flat)),
          extrudedHeight: h,
          height: 0,
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
        }),
        attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(colorForHeight(h, isLandmark)) },
        id: `bld:${b.id}`
      }));
      index.set(`bld:${b.id}`, b);
    } catch (e) {
      // Degenerate ring; skip.
    }
  }

  const primitive = new C.Primitive({
    geometryInstances: instances,
    appearance: new C.PerInstanceColorAppearance({ translucent: false, closed: true, flat: false }),
    asynchronous: true,
    releaseGeometryInstances: true
  });
  viewer.scene.primitives.add(primitive);
  return { primitive, index, count: instances.length, gis };
}
