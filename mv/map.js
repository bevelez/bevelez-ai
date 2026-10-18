// Mountain View Live — Cesium map bootstrap (dark, flat, no keys required)
// Optional: a Google Maps Platform key enables Photorealistic 3D Tiles.

export const MV = Object.freeze({
  lon: -122.0839,
  lat: 37.3861,
  // Default view: looking north-east over downtown toward the Bay
  camera: { lon: -122.0905, lat: 37.3615, height: 3600, heading: 22, pitch: -44 },
  bounds: { west: -122.14, south: 37.33, east: -122.02, north: 37.47 }
});

const C = window.Cesium;


// Key-free dark bases. 'imagery' = Esri World Imagery darkened (closest to 3D Google/Apple Maps);
// 'canvas' = Esri World Dark Gray (flat vector look). Both are CORS-enabled and need no key.
export const BASES = {
  imagery: { label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, credit: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
  canvas: { label: 'Canvas', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', max: 16, credit: 'Esri, HERE, Garmin, © OpenStreetMap contributors' }
};
function baseProvider(kind) {
  const b = BASES[kind] || BASES.imagery;
  return new C.UrlTemplateImageryProvider({ url: b.url, maximumLevel: b.max, credit: new C.Credit(b.credit) });
}
function tuneBase(viewer, kind) {
  const layer = viewer.imageryLayers.get(0);
  if (kind === 'canvas') { layer.brightness = 0.78; layer.saturation = 0.4; layer.contrast = 1.1; layer.gamma = 1.0; }
  else { layer.brightness = 0.46; layer.saturation = 0.55; layer.contrast = 1.18; layer.gamma = 0.9; layer.hue = 0.0; }
}
export function setBase(viewer, kind) {
  localStorage.setItem('mv_live_base', kind);
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(baseProvider(kind));
  tuneBase(viewer, kind);
}

export function createViewer(containerId, { google3dKey = null } = {}) {
  const viewer_base = baseProvider(localStorage.getItem('mv_live_base') || 'imagery');
  const viewer = new C.Viewer(containerId, {
    baseLayer: new C.ImageryLayer(viewer_base),
    terrain: undefined,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    vrButton: false,
    shouldAnimate: true,
    creditContainer: 'mv-credits',
    msaaSamples: 4,
    requestRenderMode: false
  });

  const scene = viewer.scene;
  const bg = C.Color.fromCssColorString('#07090d');
  scene.backgroundColor = bg;
  scene.globe.baseColor = bg;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
  scene.skyBox.show = false;
  scene.sun.show = false;
  scene.moon.show = false;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  scene.fog.enabled = true;
  scene.fog.density = 0.00035;
  scene.highDynamicRange = false;
  scene.postProcessStages.fxaa.enabled = true;
  // A fixed key light from the north-west so extruded buildings read as volumes.
  scene.light = new C.DirectionalLight({
    direction: new C.Cartesian3(-0.35, -0.55, -0.76),
    intensity: 2.2
  });

  tuneBase(viewer, localStorage.getItem('mv_live_base') || 'imagery');

  const ctl = scene.screenSpaceCameraController;
  ctl.minimumZoomDistance = 90;
  ctl.maximumZoomDistance = 45000;
  ctl.enableCollisionDetection = true;
  ctl.inertiaZoom = 0.6;

  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);

  flyHome(viewer, 0);
  return viewer;
}

export function flyHome(viewer, duration = 1.6) {
  const c = MV.camera;
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(c.lon, c.lat, c.height),
    orientation: {
      heading: C.Math.toRadians(c.heading),
      pitch: C.Math.toRadians(c.pitch),
      roll: 0
    },
    duration
  });
}

export function flyToLonLat(viewer, lon, lat, { height = 900, pitch = -38, heading = null, duration = 1.4 } = {}) {
  const h = heading === null ? viewer.camera.heading : C.Math.toRadians(heading);
  // Offset the destination so the target sits in the lower-middle of the frame.
  const back = (height / Math.tan(C.Math.toRadians(-pitch))) * 0.55;
  const dLat = (back * Math.cos(h)) / 111320;
  const dLon = (back * Math.sin(h)) / (111320 * Math.cos(C.Math.toRadians(lat)));
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromDegrees(lon - dLon, lat - dLat, height),
    orientation: { heading: h, pitch: C.Math.toRadians(pitch), roll: 0 },
    duration
  });
}

// Google Photorealistic 3D Tiles (optional, key stored by the user in localStorage).
export async function enableGoogle3D(viewer, key) {
  if (!key) return null;
  C.GoogleMaps.defaultApiKey = key;
  const tileset = await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: false });
  viewer.scene.primitives.add(tileset);
  viewer.scene.globe.show = false;
  return tileset;
}
