import * as THREE from 'three';
import {
  assignPlanarUV2,
  createCelMaterial,
  createHiFiMesh,
  mergeStaticGroupMeshes,
  createContactShadowDecal
} from './shared.js?v=20261018h';
import { buildSpectatorModel } from './crowd.js?v=20261018h';
import {
  createAmbulanceSideTexture,
  createApartmentBrickTexture,
  createBakedArenaAOMapTexture,
  createBakedArenaLightMapTexture,
  createBrickWarehouseBumpMap,
  createBrickWarehouseTexture,
  createChainLinkFenceSection,
  createCorrugatedShutterBumpMap,
  createCorrugatedShutterTexture,
  createCourtAsphaltBumpMap,
  createFlightCase,
  createHighDetailCourtAsphaltTexture,
  createIndustrialLoftWindowBumpMap,
  createIndustrialLoftWindowTexture,
  createJerseyBarrier,
  createRoofGravelTexture,
  createStreetArtMuralTexture,
  createVanGrilleTexture,
  createWoodenCrate,
  createWoodenPallet
} from './stage.js?v=20261018h';

// ============================================================================
// 5. BLOCK-PARTY ARENA BACKDROP: BANNERS, BARRICADES, CABLES & STRING LIGHTS
// ============================================================================
function createBattleBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1c1836';
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = '#ff3898';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 468, 212);

  ctx.font = '900 74px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BOOMBOX', 256, 110);
  ctx.fillStyle = '#ff6b9d';
  ctx.fillText('BATTLE', 256, 192);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * High-Resolution 2048x2048 Weathered Asphalt Arena Texture
 * Regulation streetball court markings (yellow basketball key, free-throw circle arc,
 * 3-point arc, white battle cypher ring), tire skids, tar cracks, and authentic graffiti throw-ups.
 */
export function createWeatheredAsphaltArenaTexture() {
  return createHighDetailCourtAsphaltTexture();
}

/**
 * Galvanized Steel Bike-Rack Barricade Unit
 * Replaces solid dark slabs with authentic open tubular steel perimeter barriers.
 */
export function createSteelBarricadeUnit() {
  const bGroup = new THREE.Group();

  const frameColor = 0x8a92a6;
  const framePipeRadius = 0.025;

  // Top Rail
  const topPipe = createHiFiMesh(new THREE.CylinderGeometry(framePipeRadius, framePipeRadius, 1.60, 8), frameColor, 0.04);
  topPipe.rotation.z = Math.PI / 2;
  topPipe.position.y = 0.96;
  bGroup.add(topPipe);

  // Bottom Rail
  const botPipe = createHiFiMesh(new THREE.CylinderGeometry(framePipeRadius, framePipeRadius, 1.60, 8), frameColor, 0.04);
  botPipe.rotation.z = Math.PI / 2;
  botPipe.position.y = 0.14;
  bGroup.add(botPipe);

  // Side Vertical Legs
  [-0.80, 0.80].forEach((lx) => {
    const leg = createHiFiMesh(new THREE.CylinderGeometry(framePipeRadius, framePipeRadius, 0.96, 8), frameColor, 0.04);
    leg.position.set(lx, 0.48, 0);
    bGroup.add(leg);

    // Flat Bridge Foot on Floor
    const foot = createHiFiMesh(new THREE.BoxGeometry(0.08, 0.022, 0.48), 0x5a6274, 0.04);
    foot.position.set(lx, 0.011, 0);
    bGroup.add(foot);
  });

  // Vertical Internal Pickets (7 tubular spokes)
  for (let p = 1; p <= 7; p++) {
    const px = -0.80 + p * (1.60 / 8);
    const picket = createHiFiMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.80, 6), frameColor, 0.03);
    picket.position.set(px, 0.55, 0);
    bGroup.add(picket);
  }

  return bGroup;
}

/**
 * Heavy-Duty 3D Black Stage Power Feeder Cables with Yellow Electrical Hazard Tape Wraps
 * Elevated to y = 0.042m with heavy rubber bridge ramps (Component 7).
 */
export function buildClampedPowerCables(scene) {
  const cableGroup = new THREE.Group();

  // Heavy-duty multi-core stage feeder bundles (radius = 0.046m, dark rubber)
  const cablePaths = [
    // Feeder Bundle 1: Curves from stage truck distro out toward West warehouse
    [
      new THREE.Vector3(1.8, 0.042, -4.2),
      new THREE.Vector3(-0.4, 0.042, -3.2),
      new THREE.Vector3(-2.6, 0.042, -1.8),
      new THREE.Vector3(-4.8, 0.042, 0.2),
      new THREE.Vector3(-6.8, 0.042, 2.4),
      new THREE.Vector3(-8.2, 0.042, 3.8)
    ],
    // Feeder Bundle 2: Curves across midcourt toward South entrance
    [
      new THREE.Vector3(1.4, 0.042, -4.0),
      new THREE.Vector3(0.2, 0.042, -2.6),
      new THREE.Vector3(-1.2, 0.042, -0.6),
      new THREE.Vector3(-2.4, 0.042, 1.8),
      new THREE.Vector3(-3.2, 0.042, 4.4),
      new THREE.Vector3(-3.6, 0.042, 7.2)
    ],
    // Feeder Bundle 3: Curves toward East viaduct
    [
      new THREE.Vector3(4.2, 0.042, -4.2),
      new THREE.Vector3(5.6, 0.042, -2.8),
      new THREE.Vector3(6.8, 0.042, -1.0),
      new THREE.Vector3(7.8, 0.042, 1.4),
      new THREE.Vector3(8.6, 0.042, 3.6)
    ]
  ];

  // Subtle muted-amber gaffer-tape bands (0xb88828) blending with weathered asphalt floor
  const tapeGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.065, 12);
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xb88828 });

  cablePaths.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.045, 10, false);
    const cableMesh = createHiFiMesh(tubeGeo, 0x141418, 0.03);
    cableMesh.name = 'floorCable';
    cableGroup.add(cableMesh);

    // Subtle muted-amber gaffer-tape wraps spaced every ~1.6m along cable
    const totalLength = curve.getLength();
    const numWraps = Math.floor(totalLength / 1.6);
    for (let w = 1; w <= numWraps; w++) {
      const u = (w * 1.6) / totalLength;
      if (u >= 0.96) continue;
      const pt = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);

      const tape = new THREE.Mesh(tapeGeo, tapeMat);
      tape.name = 'floorTape';
      tape.position.copy(pt);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      tape.quaternion.copy(quat);
      cableGroup.add(tape);
    }
  });

  // Sleek, Low-Profile Dark-Charcoal Rubber Stage Conduits / Crossovers (0x1a1c24 / 0x16161a)
  // Replaces high-contrast yellow hazard boxes to prevent clashing with cypher ring lines
  const rampSpecs = [
    { pos: [-1.8, 0.020, -2.1], rotY: 0.55 },
    { pos: [-4.2, 0.020, -0.1], rotY: 0.65 },
    { pos: [-6.2, 0.020, 2.1], rotY: 0.72 },
    { pos: [5.8, 0.020, -2.4], rotY: -0.52 },
    { pos: [7.2, 0.020, 0.2], rotY: -0.42 }
  ];

  rampSpecs.forEach(({ pos, rotY }) => {
    const rampGroup = new THREE.Group();
    rampGroup.position.set(...pos);
    rampGroup.rotation.y = rotY;

    // Sleek low-profile sloped dark-charcoal rubber crossover base (0x16161a)
    const baseRamp = createHiFiMesh(new THREE.BoxGeometry(0.44, 0.038, 0.92), 0x16161a, 0.025);
    baseRamp.position.y = 0.019;
    rampGroup.add(baseRamp);

    // Dark-charcoal rubber textured center tread lid (0x1a1c24)
    const conduitLid = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.008, 0.86), 0x1a1c24, 0.02);
    conduitLid.position.y = 0.040;
    rampGroup.add(conduitLid);

    // Low-profile molded anti-slip tread grooves across rubber conduit
    for (let s = -0.36; s <= 0.36; s += 0.12) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.002, 0.28),
        new THREE.MeshBasicMaterial({ color: 0x111216 })
      );
      rib.position.set(0, 0.046, s);
      rampGroup.add(rib);
    }

    // Small, subtle muted-amber safety edge tabs (0x9e7220) blending with stage floor
    [-0.41, 0.41].forEach((sz) => {
      const edgeMarker = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.002, 0.018),
        new THREE.MeshBasicMaterial({ color: 0x9e7220 })
      );
      edgeMarker.position.set(0, 0.042, sz);
      rampGroup.add(edgeMarker);
    });

    cableGroup.add(rampGroup);
  });

  mergeStaticGroupMeshes(cableGroup);
  scene.add(cableGroup);
  return cableGroup;
}

/**
 * Left Two-Story Industrial Building with Second-Floor Spectator Balcony
 * Replaces bare box with brick warehouse facade, roll-up door, glowing amber windows,
 * cantilevered steel balcony deck, industrial pipe railings, and VIP spectators.
 */
export function buildIndustrialBuilding(scene) {
  const building = new THREE.Group();
  building.position.set(-9.8, 0, -2.6);
  building.rotation.y = 1.15; // Angled facing southeast into arena courtyard and Orbit View

  const brickTex = createBrickWarehouseTexture();

  // 1. Main Two-Story Warehouse Facade (11.2m x 8.8m x 2.2m) with Running-Bond Brickwork
  // Thin depth 2.2m prevents back-wall camera orbit occlusion at X = -13.5
  const mainFacadeGeo = assignPlanarUV2(new THREE.BoxGeometry(11.2, 8.8, 2.2), null, 'xy');
  const mainFacade = createHiFiMesh(mainFacadeGeo, 0xffffff, 0.038, brickTex, 0x28140e, {
    creviceAO: true,
    bumpMap: createBrickWarehouseBumpMap(),
    bumpScale: 0.04,
    aoMap: createBakedArenaAOMapTexture(),
    aoMapIntensity: 1.0,
    lightMap: createBakedArenaLightMapTexture(),
    lightMapIntensity: 1.0
  });
  mainFacade.position.set(0, 4.4, 1.2);
  building.add(mainFacade);

  // Roof Concrete Coping Parapet with Weathered Stone Trim
  const roofParapet = createHiFiMesh(new THREE.BoxGeometry(11.5, 0.42, 2.4), 0x555866, 0.04);
  roofParapet.position.set(0, 8.8, 1.2);
  building.add(roofParapet);

  // Roof Bitumen & Pea-Gravel Deck Membrane (Eliminates raw polygon in NW orbit view!)
  const roofDeck = new THREE.Mesh(
    new THREE.PlaneGeometry(11.2, 4.6),
    new THREE.MeshBasicMaterial({ map: createRoofGravelTexture() })
  );
  roofDeck.rotation.x = -Math.PI / 2;
  roofDeck.position.set(0, 9.02, 0);
  building.add(roofDeck);

  // Commercial Rooftop HVAC Condenser Chiller Unit
  const acUnitGroup = new THREE.Group();
  acUnitGroup.position.set(-2.2, 9.02, -0.6);

  const acBody = createHiFiMesh(new THREE.BoxGeometry(2.4, 1.35, 1.5), 0x586070, 0.03);
  acBody.position.y = 0.68;
  acUnitGroup.add(acBody);

  [-0.65, 0.65].forEach((fx) => {
    const fanCowl = createHiFiMesh(new THREE.CylinderGeometry(0.48, 0.52, 0.16, 16), 0x282c36, 0.025);
    fanCowl.position.set(fx, 1.42, 0);
    acUnitGroup.add(fanCowl);

    const fanGrille = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 16),
      new THREE.MeshBasicMaterial({ color: 0x14161c, side: THREE.DoubleSide })
    );
    fanGrille.rotation.x = -Math.PI / 2;
    fanGrille.position.set(fx, 1.51, 0);
    acUnitGroup.add(fanGrille);
  });

  const acPipe = createHiFiMesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), 0x8a92a2, 0.02);
  acPipe.rotation.z = Math.PI / 2;
  acPipe.position.set(0.6, 0.1, 0.6);
  acUnitGroup.add(acPipe);

  building.add(acUnitGroup);

  // Rooftop Stair Bulkhead / Access Doghouse
  const doghouse = createHiFiMesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), 0xffffff, 0.035, brickTex, 0x28140e);
  doghouse.position.set(2.8, 9.82, 0.2);
  building.add(doghouse);

  const doghouseRoof = createHiFiMesh(new THREE.BoxGeometry(1.95, 0.14, 1.95), 0x424652, 0.03);
  doghouseRoof.position.set(2.8, 10.68, 0.2);
  building.add(doghouseRoof);

  const roofDoor = createHiFiMesh(new THREE.BoxGeometry(0.85, 1.35, 0.06), 0x222634, 0.02);
  roofDoor.position.set(2.8, 9.75, 1.12);
  building.add(roofDoor);

  // Roof Vent Gooseneck Exhaust Pipe
  const ventPipe = createHiFiMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), 0x6e7584, 0.02);
  ventPipe.position.set(0.8, 9.45, -1.2);
  building.add(ventPipe);

  const ventCap = createHiFiMesh(new THREE.TorusGeometry(0.12, 0.06, 8, 12, Math.PI), 0x6e7584, 0.02);
  ventCap.position.set(0.8, 9.88, -1.2);
  ventCap.rotation.z = Math.PI / 2;
  building.add(ventCap);

  // 2. Far-Left Industrial Waste Dumpster Container (Component 1/6)
  const dumpster = createHiFiMesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), 0x243e2e, 0.035, null, 0x000000, { creviceAO: true });
  dumpster.position.set(-4.5, 0.55, 2.75);
  building.add(dumpster);
  const dumpsterLid = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.12, 1.25), 0x18241c, 0.03);
  dumpsterLid.position.set(-4.5, 1.14, 2.75);
  building.add(dumpsterLid);

  // Static ground contact shadow beneath dumpster
  const dumpsterShadow = createContactShadowDecal(1.9, 1.5, 0.72);
  dumpsterShadow.position.set(-4.5, 0.005, 2.75);
  building.add(dumpsterShadow);

  // 3. Vibrant Wildstyle Street-Art Aerosol Graffiti Mural ("REVENGE" / Urban Spray Tags)
  const muralTex = createStreetArtMuralTexture();
  const muralPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.2),
    new THREE.MeshBasicMaterial({ map: muralTex, transparent: true, side: THREE.DoubleSide })
  );
  muralPlane.position.set(-2.6, 1.75, 2.33);
  building.add(muralPlane);

  // 4. Ground Floor Corrugated Roll-Up Shutter Garage Door
  const shutterTex = createCorrugatedShutterTexture();
  const shutterBump = createCorrugatedShutterBumpMap();
  const rollUpDoor = createHiFiMesh(new THREE.BoxGeometry(3.2, 3.2, 0.16), 0xffffff, 0.04, shutterTex, 0x181a24, {
    bumpMap: shutterBump,
    bumpScale: 0.045,
    isMetallic: true
  });
  rollUpDoor.position.set(0.4, 1.6, 2.32);
  building.add(rollUpDoor);

  // Overhead Roller Housing Drum Box
  const rollerDrum = createHiFiMesh(new THREE.BoxGeometry(3.5, 0.45, 0.42), 0x222634, 0.035);
  rollerDrum.position.set(0.4, 3.35, 2.42);
  building.add(rollerDrum);

  // Twin Protective Steel Safety Bollards (Bright Hazard Yellow with Black Collars)
  [-1.4, 2.2].forEach((bx) => {
    const bollard = createHiFiMesh(new THREE.CylinderGeometry(0.09, 0.09, 1.02, 12), 0xf5c211, 0.03);
    bollard.position.set(bx, 0.51, 2.65);
    building.add(bollard);

    const bCap = createHiFiMesh(new THREE.SphereGeometry(0.09, 10, 8), 0xf5c211, 0.02);
    bCap.position.set(bx, 1.02, 2.65);
    building.add(bCap);

    const bBase = createHiFiMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), 0x181a22, 0.02);
    bBase.position.set(bx, 0.06, 2.65);
    building.add(bBase);
  });

  // 5. Ground Floor Service Door
  const serviceDoor = createHiFiMesh(new THREE.BoxGeometry(1.2, 2.4, 0.12), 0x1e3a32, 0.03);
  serviceDoor.position.set(3.0, 1.2, 2.32);
  building.add(serviceDoor);

  // Overhead Hooded Service Lamp Fixture
  const lampHood = createHiFiMesh(new THREE.BoxGeometry(0.42, 0.16, 0.32), 0x222634, 0.02);
  lampHood.position.set(3.0, 2.55, 2.48);
  building.add(lampHood);

  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  lampBulb.position.set(3.0, 2.48, 2.48);
  building.add(lampBulb);

  // Industrial Vertical Drain Downspout Pipe with Elbow Bends along Corner
  const downspout = createHiFiMesh(new THREE.CylinderGeometry(0.045, 0.045, 8.8, 10), 0x383e4e, 0.03);
  downspout.position.set(5.4, 4.4, 2.36);
  building.add(downspout);

  const downspoutElbowTop = createHiFiMesh(new THREE.TorusGeometry(0.12, 0.045, 8, 12, Math.PI / 2), 0x383e4e, 0.02);
  downspoutElbowTop.position.set(5.28, 8.7, 2.36);
  downspoutElbowTop.rotation.y = Math.PI;
  building.add(downspoutElbowTop);

  const downspoutElbowBot = createHiFiMesh(new THREE.TorusGeometry(0.12, 0.045, 8, 12, Math.PI / 2), 0x383e4e, 0.02);
  downspoutElbowBot.position.set(5.28, 0.12, 2.36);
  building.add(downspoutElbowBot);

  // 6. Eight Second-Floor Multi-Pane Industrial Loft Windows with Incandescent Amber Glow
  const loftWinTex = createIndustrialLoftWindowTexture();
  const loftWinBump = createIndustrialLoftWindowBumpMap();
  const winMat = createCelMaterial(0xffffff, loftWinTex, 0x4a2a10, {
    bumpMap: loftWinBump,
    bumpScale: 0.035,
    glintThreshold: 0.85,
    glintIntensity: 0.6
  });

  const windowCoords = [
    // Lower tier
    { x: -3.8, y: 5.3 },
    { x: -1.8, y: 5.3 },
    { x: 0.8,  y: 5.3 },
    { x: 3.2,  y: 5.3 },
    // Upper tier
    { x: -3.8, y: 7.3 },
    { x: -1.8, y: 7.3 },
    { x: 0.8,  y: 7.3 },
    { x: 3.2,  y: 7.3 }
  ];

  windowCoords.forEach(({ x, y }) => {
    // Glass Pane Plane with glowing incandescent loft texture & bump relief
    const winPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.62),
      winMat
    );
    winPlane.position.set(x, y, 2.33);
    building.add(winPlane);

    // Dark Iron Window Casing (Perimeter borders so glass is completely unoccluded)
    const topBar = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.08, 0.08), 0x141620, 0.03);
    topBar.position.set(x, y + 0.84, 2.34);
    building.add(topBar);

    const botBar = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.08, 0.08), 0x141620, 0.03);
    botBar.position.set(x, y - 0.84, 2.34);
    building.add(botBar);

    const leftBar = createHiFiMesh(new THREE.BoxGeometry(0.08, 1.68, 0.08), 0x141620, 0.03);
    leftBar.position.set(x - 0.78, y, 2.34);
    building.add(leftBar);

    const rightBar = createHiFiMesh(new THREE.BoxGeometry(0.08, 1.68, 0.08), 0x141620, 0.03);
    rightBar.position.set(x + 0.78, y, 2.34);
    building.add(rightBar);

    // Extruded Weathered Stone Window Sill Underneath
    const stoneSill = createHiFiMesh(new THREE.BoxGeometry(1.82, 0.14, 0.24), 0x78747f, 0.03);
    stoneSill.position.set(x, y - 0.94, 2.38);
    building.add(stoneSill);

    // Dark Iron Lintel Header
    const lintel = createHiFiMesh(new THREE.BoxGeometry(1.78, 0.12, 0.16), 0x222634, 0.025);
    lintel.position.set(x, y + 0.94, 2.36);
    building.add(lintel);
  });

  // 7. Second-Floor Cantilevered Steel VIP Balcony Deck & Industrial Pipe Railings
  // Cantilevered Steel I-Beams with 45° Diagonal Support Cross-Braces
  [-0.6, 0.8, 2.2, 3.6].forEach((bx) => {
    const beam = createHiFiMesh(new THREE.BoxGeometry(0.18, 0.28, 2.3), 0x2e354a, 0.04);
    beam.position.set(bx, 3.75, 3.1);
    building.add(beam);

    const brace = createHiFiMesh(new THREE.BoxGeometry(0.12, 0.12, 1.8), 0x242a3c, 0.03);
    brace.position.set(bx, 2.9, 2.8);
    brace.rotation.x = -Math.PI / 4;
    building.add(brace);
  });

  const balconyDeck = createHiFiMesh(new THREE.BoxGeometry(4.8, 0.18, 2.05), 0x1e2232, 0.04);
  balconyDeck.position.set(1.5, 3.90, 3.2);
  building.add(balconyDeck);

  const railGroup = new THREE.Group();
  railGroup.position.set(1.5, 3.98, 3.2);

  // Top Rail & Mid Rail
  const topRail = createHiFiMesh(new THREE.CylinderGeometry(0.038, 0.038, 4.8, 10), 0x68728a, 0.04);
  topRail.rotation.z = Math.PI / 2;
  topRail.position.set(0, 1.05, 1.0);
  railGroup.add(topRail);

  const midRail = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 4.8, 8), 0x525c72, 0.03);
  midRail.rotation.z = Math.PI / 2;
  midRail.position.set(0, 0.52, 1.0);
  railGroup.add(midRail);

  // Railing Upright Posts
  [-2.3, -1.15, 0, 1.15, 2.3].forEach((px) => {
    const post = createHiFiMesh(new THREE.CylinderGeometry(0.032, 0.032, 1.05, 8), 0x424a60, 0.04);
    post.position.set(px, 0.52, 1.0);
    railGroup.add(post);
  });

  // End Return Rails
  [-2.3, 2.3].forEach((ex) => {
    const endTop = createHiFiMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.95, 8), 0x68728a, 0.03);
    endTop.rotation.x = Math.PI / 2;
    endTop.position.set(ex, 1.05, 0);
    railGroup.add(endTop);
  });

  building.add(railGroup);

  // 8. VIP Balcony Spectators Leaning on the Railing (7 Varied Animated Characters)
  const spectatorColors = [
    { shirt: 0x9e3328, pants: 0x22242a, skin: 0xd89c74 }, // Terracotta Crimson
    { shirt: 0x3b4d66, pants: 0x2d3a4d, skin: 0x8d5534 }, // Slate Denim
    { shirt: 0xd49b35, pants: 0x22242a, skin: 0xf0c8a0 }, // Warm Mustard
    { shirt: 0x4a5d3f, pants: 0x283226, skin: 0xa86c48 }, // Olive Drab
    { shirt: 0xc26a2b, pants: 0x22242a, skin: 0xe0b088 }, // Burnt Ochre
    { shirt: 0xe8e2d4, pants: 0x3b4d66, skin: 0x5c3826 }, // Off-White / Cream
    { shirt: 0x22242a, pants: 0x342a22, skin: 0x8d5534 }  // Deep Charcoal
  ];

  const balconySpectators = [-0.6, 0.1, 0.8, 1.5, 2.2, 2.9, 3.5].map((bx, idx) => {
    const col = spectatorColors[idx % spectatorColors.length];
    const spec = buildSpectatorModel(col.shirt, col.pants, col.skin, idx);
    spec.root.scale.setScalar(0.82);
    spec.root.position.set(bx, 3.98, 3.75);
    spec.root.rotation.y = 0.05 * (idx - 3);
    spec.torso.rotation.x = 0.18;
    spec.leftArm.rotation.set(-0.85, 0, -0.18);
    spec.rightArm.rotation.set(-0.95 - (idx % 2) * 0.45, 0, 0.18);
    if (spec.leftElbow) spec.leftElbow.rotation.set(-0.75, 0, 0);
    if (spec.rightElbow) spec.rightElbow.rotation.set(-0.65, 0, 0);
    building.add(spec.root);
    return spec;
  });

  mergeStaticGroupMeshes(building);
  scene.add(building);
  return { building, balconySpectators };
}

// ----------------------------------------------------------------------------
// EAST ARCHITECTURE: ELEVATED SUBWAY VIADUCT ARCHES & OVERHEAD RAILROAD
// ----------------------------------------------------------------------------
let _bodegaShopfrontTex = null;
export function createBodegaShopfrontTexture() {
  if (_bodegaShopfrontTex) return _bodegaShopfrontTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Warm glowing interior gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, '#ffe89c'); // Warm ceiling fluorescent glow
  grad.addColorStop(0.2, '#ffbe42');
  grad.addColorStop(0.6, '#ea7818');
  grad.addColorStop(1.0, '#3a1a08'); // Lower floor dark amber
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Store shelving display rows
  const shelfY = [320, 520, 720, 880];
  shelfY.forEach((sy, idx) => {
    // Shelf board
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(40, sy, 944, 24);
    ctx.fillStyle = '#ffcc66';
    ctx.fillRect(40, sy - 4, 944, 4);

    // Products / bottles on shelf
    const numItems = 28;
    for (let i = 0; i < numItems; i++) {
      const ix = 56 + i * 32;
      const ih = 48 + ((i * 13) % 40);
      const iy = sy - ih;
      const hue = (i * 37 + idx * 73) % 360;
      ctx.fillStyle = `hsl(${hue}, 75%, 60%)`;
      ctx.fillRect(ix, iy, 24, ih);
      // Highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(ix + 2, iy + 2, 6, ih - 4);
    }
  });

  // Hanging glowing neon sign in window: "24/7 BODEGA"
  ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
  ctx.fillRect(200, 80, 624, 140);
  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 8;
  ctx.strokeRect(200, 80, 624, 140);

  ctx.font = '900 72px "Chakra Petch", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2a85';
  ctx.shadowColor = '#ff2a85';
  ctx.shadowBlur = 24;
  ctx.fillText('24/7 BODEGA', 512, 176);
  ctx.shadowBlur = 0;

  // Window frame pane dividers / glint reflections
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 1024);
  ctx.moveTo(0, 480);
  ctx.lineTo(1024, 480);
  ctx.stroke();

  // Diagonal glass reflection highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(360, 0);
  ctx.lineTo(0, 760);
  ctx.closePath();
  ctx.fill();

  _bodegaShopfrontTex = new THREE.CanvasTexture(c);
  _bodegaShopfrontTex.colorSpace = THREE.SRGBColorSpace;
  _bodegaShopfrontTex.anisotropy = 4;
  return _bodegaShopfrontTex;
}

let _bodegaShopfrontBump = null;
export function createBodegaShopfrontBumpMap() {
  if (_bodegaShopfrontBump) return _bodegaShopfrontBump;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Neutral base
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 1024, 1024);

  // Window mullions (embossed)
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 1024);
  ctx.moveTo(0, 480);
  ctx.lineTo(1024, 480);
  ctx.stroke();

  // Outer border frame
  ctx.lineWidth = 24;
  ctx.strokeRect(12, 12, 1000, 1000);

  // Shelves (raised)
  const shelfY = [320, 520, 720, 880];
  shelfY.forEach((sy) => {
    ctx.fillStyle = '#b8b8b8';
    ctx.fillRect(40, sy, 944, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, sy - 4, 944, 4);

    // Products
    for (let i = 0; i < 28; i++) {
      const ix = 56 + i * 32;
      const ih = 48 + ((i * 13) % 40);
      const val = 140 + ((i * 23) % 80);
      ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
      ctx.fillRect(ix, sy - ih, 24, ih);
    }
  });

  // Hanging sign frame & text
  ctx.fillStyle = '#606060';
  ctx.fillRect(200, 80, 624, 140);
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 10;
  ctx.strokeRect(200, 80, 624, 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 72px "Chakra Petch", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('24/7 BODEGA', 512, 176);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  _bodegaShopfrontBump = tex;
  return tex;
}

let _viaductStoneTex = null;
export function createViaductStoneTexture() {
  if (_viaductStoneTex) return _viaductStoneTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Dark charcoal stone base
  ctx.fillStyle = '#1c1a22';
  ctx.fillRect(0, 0, 2048, 1024);

  const rowH = 128;
  const numRows = 8;
  for (let r = 0; r < numRows; r++) {
    const y0 = r * rowH;
    const rowOffset = (r % 2 === 0) ? 0 : 160;
    let x = -rowOffset;
    let blockIdx = 0;
    while (x < 2048) {
      const bw = 260 + ((blockIdx * 73 + r * 37) % 120);
      const lightness = 36 + ((blockIdx * 29 + r * 41) % 18);
      ctx.fillStyle = `hsl(245, 8%, ${lightness}%)`;
      ctx.fillRect(x + 4, y0 + 4, bw - 8, rowH - 8);

      // Fine stone aggregate stipple noise
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      for (let s = 0; s < 40; s++) {
        const sx = x + 8 + ((s * 47) % (bw - 16));
        const sy = y0 + 8 + ((s * 31) % (rowH - 16));
        ctx.fillRect(sx, sy, 3, 2);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      for (let s = 0; s < 40; s++) {
        const sx = x + 8 + ((s * 59) % (bw - 16));
        const sy = y0 + 8 + ((s * 43) % (rowH - 16));
        ctx.fillRect(sx, sy, 4, 2);
      }

      // Comic ink bottom shadow line on each stone block
      ctx.strokeStyle = '#0e0c12';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 4, y0 + rowH - 4);
      ctx.lineTo(x + bw - 4, y0 + rowH - 4);
      ctx.stroke();

      x += bw;
      blockIdx++;
    }
  }

  // Heavy mortar joint grid overlay
  ctx.strokeStyle = '#14121a';
  ctx.lineWidth = 8;
  for (let r = 0; r <= numRows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(2048, r * rowH);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _viaductStoneTex = tex;
  return tex;
}

let _viaductStoneBump = null;
export function createViaductStoneBumpMap() {
  if (_viaductStoneBump) return _viaductStoneBump;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Recessed mortar joints base (very dark)
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, 2048, 1024);

  const rowH = 128;
  const numRows = 8;
  for (let r = 0; r < numRows; r++) {
    const y0 = r * rowH;
    const rowOffset = (r % 2 === 0) ? 0 : 160;
    let x = -rowOffset;
    let blockIdx = 0;
    while (x < 2048) {
      const bw = 260 + ((blockIdx * 73 + r * 37) % 120);
      const val = 150 + ((blockIdx * 29 + r * 41) % 40);

      // Block face (raised)
      ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
      ctx.fillRect(x + 5, y0 + 5, bw - 10, rowH - 10);

      // Chiseled stone edge highlight (inner bevel)
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 8, y0 + 8, bw - 16, rowH - 16);

      x += bw;
      blockIdx++;
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _viaductStoneBump = tex;
  return tex;
}

export function buildEastViaductBuilding(scene) {
  const viaductGroup = new THREE.Group();

  const brickTex = createBrickWarehouseTexture();

  // 1. Curved Brick Subway Viaduct Wrapping Behind the Stage (4 Semicircular Arches)
  // Arch Nodes curving from behind stage North to East
  const archNodes = [
    { pos: [1.6, 0, -8.6],  rotY: -0.12 },
    { pos: [5.2, 0, -7.8],  rotY: -0.32 },
    { pos: [8.6, 0, -5.8],  rotY: -0.58 },
    { pos: [11.0, 0, -1.8], rotY: -0.85 }
  ];

  archNodes.forEach(({ pos, rotY }, idx) => {
    const archGroup = new THREE.Group();
    archGroup.position.set(...pos);
    archGroup.rotation.y = rotY;

    // Massive Brick Pier Columns (Left & Right)
    [-1.85, 1.85].forEach((px) => {
      const pier = createHiFiMesh(new THREE.BoxGeometry(1.2, 4.4, 3.2), 0xffffff, 0.04, brickTex, 0x24120c, { creviceAO: true });
      pier.position.set(px, 2.2, 0);
      archGroup.add(pier);

      // Stone Plinth Base
      const plinth = createHiFiMesh(new THREE.BoxGeometry(1.35, 0.48, 3.35), 0x4a4852, 0.04, null, 0x000000, { creviceAO: true });
      plinth.position.set(px, 0.24, 0);
      archGroup.add(plinth);

      // Stone Impost Cap at Springline
      const impost = createHiFiMesh(new THREE.BoxGeometry(1.35, 0.24, 3.35), 0x6e6a75, 0.035);
      impost.position.set(px, 4.3, 0);
      archGroup.add(impost);
    });

    // Deep Dark Recessed Tunnel Cavity
    const tunnelDark = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 4.2, 2.8),
      new THREE.MeshBasicMaterial({ color: 0x07060c })
    );
    tunnelDark.position.set(0, 2.1, -0.2);
    archGroup.add(tunnelDark);

    // Semicircular Arched Brick Voussoirs (Arch Crown)
    const archRingGeo = new THREE.TorusGeometry(1.65, 0.30, 8, 24, Math.PI);
    const archRing = createHiFiMesh(archRingGeo, 0xffffff, 0.035, brickTex, 0x24120c);
    archRing.position.set(0, 4.3, 1.4);
    archGroup.add(archRing);

    // Prominent Stone Center Keystone
    const keystone = createHiFiMesh(new THREE.BoxGeometry(0.44, 0.54, 0.46), 0x8a7a72, 0.04);
    keystone.position.set(0, 5.95, 1.42);
    archGroup.add(keystone);

    // Upper Spandrel Wall
    const spandrel = createHiFiMesh(new THREE.BoxGeometry(4.8, 1.8, 3.2), 0xffffff, 0.04, brickTex, 0x24120c);
    spandrel.position.set(0, 6.1, 0);
    archGroup.add(spandrel);

    viaductGroup.add(archGroup);
  });

  // 2. Overhead Railway Tracks on Viaduct Deck (y = 7.2m)
  const trackSplinePts = [
    new THREE.Vector3(-4.8, 7.2, -11.5),
    new THREE.Vector3(-1.2, 7.2, -9.2),
    new THREE.Vector3(1.6, 7.2, -8.6),
    new THREE.Vector3(5.2, 7.2, -7.8),
    new THREE.Vector3(8.6, 7.2, -5.8),
    new THREE.Vector3(11.0, 7.2, -1.8),
    new THREE.Vector3(11.8, 7.2, 2.4),
    new THREE.Vector3(12.2, 7.2, 6.2),
    new THREE.Vector3(12.4, 7.2, 9.8),
    new THREE.Vector3(12.5, 7.2, 13.0)
  ];
  const trackCurve = new THREE.CatmullRomCurve3(trackSplinePts);

  // Continuous ballast stone bed along viaduct deck (y = 7.02m)
  const ballastGeo = new THREE.TubeGeometry(trackCurve, 48, 1.45, 4, false);
  const ballastMesh = createHiFiMesh(ballastGeo, 0x2c2a32, 0.02);
  ballastMesh.position.y = -0.15;
  ballastMesh.scale.set(1.0, 0.12, 1.0);
  viaductGroup.add(ballastMesh);

  // Longitudinal Steel I-Beam Track Girders (Inner & Outer)
  [-0.65, 0.65].forEach((offsetDist) => {
    const railOffsetPts = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const pt = trackCurve.getPoint(u);
      const tangent = trackCurve.getTangent(u);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      railOffsetPts.push(pt.clone().addScaledVector(normal, offsetDist));
    }
    const railCurve = new THREE.CatmullRomCurve3(railOffsetPts);

    // Continuous Steel Rail
    const railGeo = new THREE.TubeGeometry(railCurve, 32, 0.038, 8, false);
    const railMesh = createHiFiMesh(railGeo, 0x9ca8bc, 0.025, null, 0x000000, {
      isMetallic: true,
      glintThreshold: 0.85,
      glintIntensity: 1.6
    });
    viaductGroup.add(railMesh);
  });

  // Wooden Railroad Ties / Sleepers spaced every ~0.55m along the curved railway path
  const totalTrackLen = trackCurve.getLength();
  const numTies = Math.floor(totalTrackLen / 0.55);
  const tieGeo = new THREE.BoxGeometry(2.4, 0.16, 0.24);
  const tieColor = 0x3a3028; // Creosote dark wood with subtle warm tone

  for (let t = 0; t <= numTies; t++) {
    const u = t / numTies;
    const pt = trackCurve.getPoint(u);
    const tangent = trackCurve.getTangent(u);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const tieMesh = createHiFiMesh(tieGeo, tieColor, 0.025, null, 0x140e0a);
    tieMesh.position.copy(pt);
    tieMesh.position.y -= 0.10;

    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
    tieMesh.quaternion.copy(quat);
    viaductGroup.add(tieMesh);
  }

  // Steel Catwalk Handrail along Outer Edge
  const catwalkPts = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const pt = trackCurve.getPoint(u);
    const tangent = trackCurve.getTangent(u);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    catwalkPts.push(pt.clone().addScaledVector(normal, 1.4).add(new THREE.Vector3(0, 0.95, 0)));
  }
  const catwalkCurve = new THREE.CatmullRomCurve3(catwalkPts);
  const catwalkGeo = new THREE.TubeGeometry(catwalkCurve, 24, 0.03, 6, false);
  viaductGroup.add(createHiFiMesh(catwalkGeo, 0x485268, 0.03));

  // 3. Commercial Corner Shopfront Building & Dual Neon Marquees
  const cornerGroup = new THREE.Group();
  cornerGroup.position.set(10.2, 0, 1.8);
  cornerGroup.rotation.y = -0.58;

  // Brick Corner Facade with warm terracotta running-bond brickwork
  const cornerWall = createHiFiMesh(new THREE.BoxGeometry(6.2, 9.4, 4.2), 0xffffff, 0.04, brickTex, 0x24120c, { creviceAO: true });
  cornerWall.position.set(0, 4.7, 0);
  cornerGroup.add(cornerWall);

  // Roof Parapet
  const cornerParapet = createHiFiMesh(new THREE.BoxGeometry(6.5, 0.38, 4.4), 0x555866, 0.04);
  cornerParapet.position.set(0, 9.4, 0);
  cornerGroup.add(cornerParapet);

  // Ground Floor Shopfront Display Window with Warm Golden Interior Glow & Shelving
  const bodegaTex = createBodegaShopfrontTexture();
  const shopWin = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.6),
    new THREE.MeshBasicMaterial({ map: bodegaTex })
  );
  shopWin.position.set(0, 1.6, 2.14);
  cornerGroup.add(shopWin);

  const shopWinGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffb836, transparent: true, opacity: 0.28 })
  );
  shopWinGlow.position.set(0, 1.6, 2.15);
  cornerGroup.add(shopWinGlow);

  // Open perimeter architectural framing bars (unblocking interior window display)
  const topBar = createHiFiMesh(new THREE.BoxGeometry(3.8, 0.12, 0.12), 0x181a24, 0.03);
  topBar.position.set(0, 2.94, 2.16);
  cornerGroup.add(topBar);

  const botSill = createHiFiMesh(new THREE.BoxGeometry(3.9, 0.16, 0.16), 0x181a24, 0.03);
  botSill.position.set(0, 0.26, 2.16);
  cornerGroup.add(botSill);

  const leftPost = createHiFiMesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), 0x181a24, 0.03);
  leftPost.position.set(-1.84, 1.6, 2.16);
  cornerGroup.add(leftPost);

  const rightPost = createHiFiMesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), 0x181a24, 0.03);
  rightPost.position.set(1.84, 1.6, 2.16);
  cornerGroup.add(rightPost);

  const midMullion = createHiFiMesh(new THREE.BoxGeometry(0.08, 2.8, 0.10), 0x181a24, 0.03);
  midMullion.position.set(0, 1.6, 2.16);
  cornerGroup.add(midMullion);

  const transomBar = createHiFiMesh(new THREE.BoxGeometry(3.8, 0.08, 0.10), 0x181a24, 0.03);
  transomBar.position.set(0, 2.2, 2.16);
  cornerGroup.add(transomBar);

  // Bodega striped fabric awning above display window
  const shopAwning = createHiFiMesh(new THREE.BoxGeometry(3.9, 0.08, 1.1), 0xff2a85, 0.03);
  shopAwning.position.set(0, 3.12, 2.62);
  shopAwning.rotation.x = 0.25;
  cornerGroup.add(shopAwning);

  // Dual Glowing Neon Signs: "BOOMBOX BATTLE" in Cyan & Magenta
  const neonTop = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.72, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x24e5ff })
  );
  neonTop.position.set(0, 5.8, 2.22);
  cornerGroup.add(neonTop);

  const neonTopText = document.createElement('canvas');
  neonTopText.width = 512;
  neonTopText.height = 128;
  const ntCtx = neonTopText.getContext('2d');
  ntCtx.fillStyle = '#061828';
  ntCtx.fillRect(0, 0, 512, 128);
  ntCtx.font = '900 68px "Chakra Petch", Impact, sans-serif';
  ntCtx.textAlign = 'center';
  ntCtx.fillStyle = '#24e5ff';
  ntCtx.fillText('BOOMBOX', 256, 92);
  const ntTex = new THREE.CanvasTexture(neonTopText);
  ntTex.colorSpace = THREE.SRGBColorSpace;
  const ntFace = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.65), new THREE.MeshBasicMaterial({ map: ntTex }));
  ntFace.position.set(0, 5.8, 2.30);
  cornerGroup.add(ntFace);

  const neonBot = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.68, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xff2a85 })
  );
  neonBot.position.set(0, 6.8, 2.22);
  cornerGroup.add(neonBot);

  const neonBotText = document.createElement('canvas');
  neonBotText.width = 512;
  neonBotText.height = 128;
  const nbCtx = neonBotText.getContext('2d');
  nbCtx.fillStyle = '#28061a';
  nbCtx.fillRect(0, 0, 512, 128);
  nbCtx.font = '900 68px "Chakra Petch", Impact, sans-serif';
  nbCtx.textAlign = 'center';
  nbCtx.fillStyle = '#ff2a85';
  nbCtx.fillText('BATTLE', 256, 92);
  const nbTex = new THREE.CanvasTexture(neonBotText);
  nbTex.colorSpace = THREE.SRGBColorSpace;
  const nbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.62), new THREE.MeshBasicMaterial({ map: nbTex }));
  nbFace.position.set(0, 6.8, 2.30);
  cornerGroup.add(nbFace);

  // 4. Stacked Touring Road / Flight Cases on Pavement
  const flightCaseSpecs = [
    { pos: [-1.4, 0.42, 2.8], s: [1.1, 0.85, 0.85], col: 0x181820, txt: 'KRONOS SOUND' },
    { pos: [-1.4, 1.15, 2.8], s: [0.95, 0.62, 0.82], col: 0x161822, txt: 'TOUR RIG #4' },
    { pos: [1.5, 0.52, 2.9],  s: [1.2, 1.05, 0.92], col: 0x221a28, txt: 'FRAGILE / AMP' },
    { pos: [1.5, 1.42, 2.9],  s: [1.05, 0.72, 0.85], col: 0x181820, txt: 'KRONOS VIP' },
    { pos: [0.1, 0.38, 3.4],  s: [0.95, 0.75, 0.75], col: 0x1a202c, txt: 'CABLE TRUNK' }
  ];

  flightCaseSpecs.forEach(({ pos, s, col, txt }) => {
    const fCase = createFlightCase(s[0], s[1], s[2], col, txt);
    fCase.position.set(...pos);
    cornerGroup.add(fCase);

    if (pos[1] < 0.6) {
      const fcShadow = createContactShadowDecal(s[0] * 1.25, s[2] * 1.25, 0.70);
      fcShadow.position.set(pos[0], 0.005, pos[2]);
      cornerGroup.add(fcShadow);
    }
  });

  // 5. Stacked Wooden Shipping Pallets & Cargo Crates
  const pallet1 = createWoodenPallet(1.2, 0.14, 1.0);
  pallet1.position.set(-2.8, 0, 1.6);
  cornerGroup.add(pallet1);

  const pallet2 = createWoodenPallet(1.2, 0.14, 1.0);
  pallet2.position.set(-2.8, 0.14, 1.6);
  pallet2.rotation.y = 0.08;
  cornerGroup.add(pallet2);

  const crate1 = createWoodenCrate(0.85);
  crate1.position.set(-2.8, 0.28, 1.6);
  cornerGroup.add(crate1);

  const crate2 = createWoodenCrate(0.72);
  crate2.position.set(-3.9, 0, 1.8);
  crate2.rotation.y = 0.35;
  cornerGroup.add(crate2);

  viaductGroup.add(cornerGroup);

  mergeStaticGroupMeshes(viaductGroup);
  scene.add(viaductGroup);
  return viaductGroup;
}

// ----------------------------------------------------------------------------
// SOUTH ARCHITECTURE: STEEL TRUSS ENTRANCE ARCH & SOUND-CREW VAN WITH HEADLIGHTS
// ----------------------------------------------------------------------------
export function buildSouthEntranceAndVan(scene) {
  const group = new THREE.Group();
  group.position.set(0, 0, 11.4);

  // 1. Steel Truss Entrance Arch ("CYPHER ARENA")
  const archPillarL = createHiFiMesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), 0x3a3f55, 0.04, null, 0x000000, { creviceAO: true });
  archPillarL.position.set(-4.2, 3.2, 0);
  group.add(archPillarL);

  const archPillarR = createHiFiMesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), 0x3a3f55, 0.04, null, 0x000000, { creviceAO: true });
  archPillarR.position.set(4.2, 3.2, 0);
  group.add(archPillarR);

  const archTop = createHiFiMesh(new THREE.BoxGeometry(9.0, 0.85, 0.65), 0x3a3f55, 0.04);
  archTop.position.set(0, 6.1, 0);
  group.add(archTop);

  // Lighted Arch Marquee Banner ("CYPHER ARENA")
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.95, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffb81c })
  );
  marquee.position.set(0, 6.1, 0.38);
  group.add(marquee);

  // Concert Floodlight Rigs mounted on arch shining into the ring
  [-2.6, 2.6].forEach((fx) => {
    const floodlightHousing = createHiFiMesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), 0x141620, 0.04);
    floodlightHousing.position.set(fx, 5.4, 0.35);
    floodlightHousing.rotation.x = 0.35;
    group.add(floodlightHousing);

    const floodLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffae0 })
    );
    floodLens.position.set(fx, 5.35, 0.64);
    floodLens.rotation.x = -0.35;
    group.add(floodLens);

    // Warm Concert Floodlight Rig illuminating South entrance & van
    const archFlood = new THREE.PointLight(0xfffae0, 1.8, 16.0);
    archFlood.position.set(fx, 5.2, 0.8);
    archFlood.castShadow = false;
    group.add(archFlood);
  });

  // 2. Customized Sound-Crew Ambulance / Sound-Van Repositioned to South-West
  const vanGroup = new THREE.Group();
  vanGroup.position.set(-7.5, 0, -6.9); // World x = -7.5m, z = 4.5m
  vanGroup.rotation.y = 0.45; // Angled facing inward into the alley / street

  // Van Chassis & Body with Ambulance Decals & Emergency Texturing
  const ambulanceTex = createAmbulanceSideTexture();
  const vanGrilleTex = createVanGrilleTexture();

  const vanBody = createHiFiMesh(new THREE.BoxGeometry(2.3, 2.1, 4.6), 0xffffff, 0.04, ambulanceTex, 0x141822);
  vanBody.position.y = 1.35;
  vanGroup.add(vanBody);

  const vanCab = createHiFiMesh(new THREE.BoxGeometry(2.25, 1.6, 1.8), 0xe2e6f0, 0.04);
  vanCab.position.set(0, 1.15, 2.3);
  vanGroup.add(vanCab);

  // Front Radiator Grille
  const grilleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.65, 0.65),
    new THREE.MeshBasicMaterial({ map: vanGrilleTex })
  );
  grilleMesh.position.set(0, 0.85, 3.22);
  vanGroup.add(grilleMesh);

  // Heavy-Duty Front Bumper
  const bumper = createHiFiMesh(new THREE.BoxGeometry(2.35, 0.32, 0.28), 0x282d3c, 0.03);
  bumper.position.set(0, 0.42, 3.30);
  vanGroup.add(bumper);

  // Flashing Amber Emergency Lightbar atop Cab Roof
  const lightbarRack = createHiFiMesh(new THREE.BoxGeometry(1.85, 0.08, 0.28), 0x222632, 0.02);
  lightbarRack.position.set(0, 2.0, 2.3);
  vanGroup.add(lightbarRack);

  [-0.72, -0.24, 0.24, 0.72].forEach((lx) => {
    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    dome.position.set(lx, 2.12, 2.3);
    vanGroup.add(dome);

    const cap = createHiFiMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.03, 10), 0xdce2ec, 0.015);
    cap.position.set(lx, 2.21, 2.3);
    vanGroup.add(cap);
  });

  // Dual Side Mirrors
  [-1.24, 1.24].forEach((mx) => {
    const mStem = createHiFiMesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), 0x141620, 0.02);
    mStem.position.set(mx, 1.55, 2.65);
    vanGroup.add(mStem);

    const mHead = createHiFiMesh(new THREE.BoxGeometry(0.06, 0.32, 0.18), 0x181a24, 0.02);
    mHead.position.set(mx + (mx > 0 ? 0.08 : -0.08), 1.55, 2.65);
    vanGroup.add(mHead);
  });

  // Front Windshield
  const windshield = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.85),
    new THREE.MeshBasicMaterial({ color: 0x183446 })
  );
  windshield.position.set(0, 1.6, 3.22);
  windshield.rotation.x = -0.22;
  vanGroup.add(windshield);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshBasicMaterial({ color: 0x121216 });
  [
    [-1.15, 0.42, 1.5],
    [1.15, 0.42, 1.5],
    [-1.15, 0.42, -1.5],
    [1.15, 0.42, -1.5]
  ].forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, wy, wz);
    vanGroup.add(wheel);
  });

  // Twin Warm Glowing Headlights Shining Forward Into Ring
  // Truncated volumetric headlight beam shining into asphalt ring (Zero ground penetration: minY >= 0.02m)
  [-0.82, 0.82].forEach((hx) => {
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xd8ba54 })
    );
    headlight.position.set(hx, 0.85, 3.24);
    vanGroup.add(headlight);

    // Note: Step-van primary projection is handled by vanHeadlights in kronos.js to avoid duplicate lights.
    // Truncated volumetric headlight beam shining into asphalt ring (Zero ground penetration: minY >= 0.02m)
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.70, 4.2, 16, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff099,
      transparent: true,
      opacity: 0.055,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(hx, 0.82, 5.35);
    beam.rotation.x = 0.02;
    vanGroup.add(beam);
  });

  // Static ground contact shadow beneath sound-crew van chassis
  const vanShadow = createContactShadowDecal(2.6, 5.2, 0.75);
  vanShadow.position.set(0, 0.005, 0.8);
  vanGroup.add(vanShadow);

  group.add(vanGroup);

  // Perimeter chain-link fences flanking entrance arch & SW alley
  // West South Perimeter: x in [-8.2, -4.2], z = -0.2 (world z = 11.2)
  const fenceSW = createChainLinkFenceSection(4.0, 2.4);
  fenceSW.position.set(-6.2, 0, -0.2);
  group.add(fenceSW);

  // East South Perimeter: x in [4.2, 8.2], z = -0.2 (world z = 11.2)
  const fenceSE = createChainLinkFenceSection(4.0, 2.4);
  fenceSE.position.set(6.2, 0, -0.2);
  group.add(fenceSE);

  // South-West Alley Fence (in front of ambulance, x = -6.2m, z extending from world 4.0m to 10.5m)
  for (let zf = -7.2; zf <= -1.2; zf += 3.0) {
    const alleyFence = createChainLinkFenceSection(3.0, 2.4);
    alleyFence.position.set(-6.2, 0, zf);
    alleyFence.rotation.y = Math.PI / 2;
    group.add(alleyFence);
  }

  // 3. Flanking Brick Apartment Facades with Lit Multi-Pane Windows & Fire Escapes
  const aptBrickTex = createApartmentBrickTexture();
  const loftWinTex = createIndustrialLoftWindowTexture();
  const loftWinBump = createIndustrialLoftWindowBumpMap();
  const aptWinMat = createCelMaterial(0xffffff, loftWinTex, 0x4a2a10, {
    bumpMap: loftWinBump,
    bumpScale: 0.035,
    side: THREE.DoubleSide
  });

  [-8.6, 8.6].forEach((bx, idx) => {
    const aptGroup = new THREE.Group();
    aptGroup.position.set(bx, 0, 2.2); // Setback to world z = 13.6m gives > 0.13m clearance from ORBIT camera sphere
    aptGroup.rotation.y = idx === 0 ? 0.32 : -0.32;

    // A. Main 3-Story Brownstone Brick Facade with creviceAO
    const aptBody = createHiFiMesh(new THREE.BoxGeometry(5.2, 9.8, 3.8), 0xffffff, 0.038, aptBrickTex, 0x22120d, { creviceAO: true });
    aptBody.position.set(0, 4.9, 0);
    aptGroup.add(aptBody);

    // B. Decorative Stone Roof Parapet Coping Crown
    const aptParapet = createHiFiMesh(new THREE.BoxGeometry(5.35, 0.38, 3.95), 0x5a5864, 0.035);
    aptParapet.position.set(0, 9.85, 0);
    aptGroup.add(aptParapet);

    // C. Six Multi-Pane Lit Sash Windows with Incandescent Amber Interior Glow
    const aptWindowCoords = [
      { x: -1.35, y: 2.6 }, { x: 1.35, y: 2.6 },
      { x: -1.35, y: 5.2 }, { x: 1.35, y: 5.2 },
      { x: -1.35, y: 7.8 }, { x: 1.35, y: 7.8 }
    ];

    aptWindowCoords.forEach(({ x, y }) => {
      // Lit window glass plane facing outward towards arena cypher with bump relief
      const winPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 1.55),
        aptWinMat
      );
      winPlane.position.set(x, y, -1.91);
      winPlane.rotation.y = Math.PI;
      aptGroup.add(winPlane);

      // Extruded weathered stone window sill
      const stoneSill = createHiFiMesh(new THREE.BoxGeometry(1.45, 0.12, 0.22), 0x6e6878, 0.025);
      stoneSill.position.set(x, y - 0.84, -1.95);
      aptGroup.add(stoneSill);

      // Dark masonry lintel header
      const lintel = createHiFiMesh(new THREE.BoxGeometry(1.42, 0.12, 0.16), 0x3a3644, 0.025);
      lintel.position.set(x, y + 0.84, -1.94);
      aptGroup.add(lintel);
    });

    // D. Multi-Tier Front Fire Escape with Railings and Ladders
    const escColX = idx === 0 ? 1.35 : -1.35;
    for (let f = 1; f <= 3; f++) {
      const fy = f * 2.6 - 0.85;

      // Platform Grate
      const platform = createHiFiMesh(new THREE.BoxGeometry(1.8, 0.08, 0.85), 0x181820, 0.025);
      platform.position.set(escColX, fy, -2.33);
      aptGroup.add(platform);

      // Front Safety Railing
      const frontRail = createHiFiMesh(new THREE.BoxGeometry(1.8, 0.65, 0.04), 0x14141a, 0.02);
      frontRail.position.set(escColX, fy + 0.33, -2.75);
      aptGroup.add(frontRail);

      // Side Safety Railings
      [-0.9, 0.9].forEach((sx) => {
        const sideRail = createHiFiMesh(new THREE.BoxGeometry(0.04, 0.65, 0.85), 0x14141a, 0.02);
        sideRail.position.set(escColX + sx, fy + 0.33, -2.33);
        aptGroup.add(sideRail);
      });

      // Connecting Drop Ladder to next tier
      if (f < 3) {
        const ladder = createHiFiMesh(new THREE.BoxGeometry(0.38, 2.5, 0.04), 0x181822, 0.02);
        ladder.position.set(escColX + (idx === 0 ? -0.55 : 0.55), fy + 1.25, -2.76);
        ladder.rotation.z = idx === 0 ? 0.10 : -0.10;
        aptGroup.add(ladder);
      }
    }

    group.add(aptGroup);
  });

  // 4. Staggered Concrete Jersey Barriers along z = 6.2m - 6.8m facing Orbit camera frustum
  // In group space (group is at z = 11.4): z_group = z_world - 11.4
  const staggeredLayout = [
    { x: -3.8, z: 6.2 - 11.4, rotY: -0.92 },
    { x: -2.0, z: 6.6 - 11.4, rotY: -0.82 },
    { x: -0.2, z: 6.3 - 11.4, rotY: -0.72 },
    { x:  1.6, z: 6.7 - 11.4, rotY: -0.62 },
    { x:  3.4, z: 6.4 - 11.4, rotY: -0.52 },
    { x:  5.2, z: 6.8 - 11.4, rotY: -0.42 }
  ];

  staggeredLayout.forEach(({ x, z, rotY }) => {
    const barrier = createJerseyBarrier(2.1, 0.88, 0.58);
    barrier.position.set(x, 0, z);
    barrier.rotation.y = rotY;
    group.add(barrier);

    const bShadow = createContactShadowDecal(2.3, 0.8, 0.65);
    bShadow.position.set(x, 0.005, z);
    bShadow.rotation.y = rotY;
    group.add(bShadow);
  });

  // Angled Flanking Wing Barriers curving into arena flanks
  const wingBarriers = [
    { x: -6.8, z: -2.3, rotY: 0.45 },
    { x: 6.8,  z: -2.3, rotY: -0.45 }
  ];
  wingBarriers.forEach(({ x, z, rotY }) => {
    const barrier = createJerseyBarrier(2.1, 0.88, 0.58);
    barrier.position.set(x, 0, z);
    barrier.rotation.y = rotY;
    group.add(barrier);

    const wShadow = createContactShadowDecal(2.3, 0.8, 0.65);
    wShadow.position.set(x, 0.005, z);
    wShadow.rotation.y = rotY;
    group.add(wShadow);
  });

  // 5. Stacked Touring Flight Cases near South-East and South-West Courtyard Perimeter
  const perimeterCases = [
    // South-East Stack
    { pos: [3.8, 0.42, -2.6], s: [1.1, 0.85, 0.85], col: 0x181820, txt: 'STAGE CREW' },
    { pos: [3.8, 1.15, -2.6], s: [0.95, 0.62, 0.82], col: 0x161822, txt: 'LIGHTING RIG' },
    { pos: [4.9, 0.38, -2.4], s: [1.05, 0.75, 0.80], col: 0x221a28, txt: 'KRONOS BEATS' },
    // South-West Stack (Framing foreground Orbit View)
    { pos: [-4.2, 0.42, -3.2], s: [1.1, 0.85, 0.85], col: 0x141820, txt: 'BASS SUB #2' },
    { pos: [-4.2, 1.15, -3.2], s: [0.95, 0.62, 0.80], col: 0x1c1a24, txt: 'PA MONITORS' },
    { pos: [-3.2, 0.36, -3.4], s: [0.88, 0.72, 0.75], col: 0x182024, txt: 'MIC STANDS' }
  ];
  perimeterCases.forEach(({ pos, s, col, txt }) => {
    const fCase = createFlightCase(s[0], s[1], s[2], col, txt);
    fCase.position.set(...pos);
    group.add(fCase);
  });

  mergeStaticGroupMeshes(group);
  scene.add(group);
  return group;
}

export function buildArenaEnvironment(scene) {
  // 1. Full 360-Degree Starry Midnight Block-Party Sky Dome (Zero Black Void!)
  const starGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = 32 + Math.random() * 28;
    starPos[i * 3] = Math.cos(theta) * r;
    starPos[i * 3 + 1] = 4.5 + Math.random() * 28;
    starPos[i * 3 + 2] = Math.sin(theta) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.90 })
  );
  scene.add(stars);

  // 2. Left & Right "BOOMBOX BATTLE" Stage Signs
  const bannerTex = createBattleBannerTexture();
  [
    { pos: [-2.8, 2.25, -5.8], rotY: 0.25 },
    { pos: [7.5, 2.25, -4.8], rotY: -0.35 }
  ].forEach(({ pos, rotY }) => {
    const bMesh = createHiFiMesh(new THREE.BoxGeometry(2.1, 1.05, 0.14), 0x1c1836, 0.04);
    bMesh.position.set(...pos);
    bMesh.rotation.y = rotY;
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(1.98, 0.95, 0.002),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    face.name = 'stage_banner_face';
    face.position.z = 0.09;
    bMesh.add(face);
    scene.add(bMesh);
  });

  // 3. West Architecture: Two-Story Industrial Building with Balcony & VIP Spectators (x < 0)
  buildIndustrialBuilding(scene);

  // 4. East Architecture: Urban Brick Viaduct & Corner Building with Neon Signs & Flight Cases (x > 0)
  buildEastViaductBuilding(scene);

  // 5. South Architecture: Steel Truss Entrance Arch ("CYPHER ARENA") & Sound-Crew Van with Headlights (z > 0)
  buildSouthEntranceAndVan(scene);

  // 6. Full 360-Degree Galvanized Steel Crowd Barricades & Cheering Spectators Around Cypher (r = 6.8m - 7.5m)
  const barricadeAngles = [
    -1.32, -1.06, -0.82, -0.58, -0.32, -0.08, 0.16, 0.40,
    0.68, 0.92, 1.16, 1.40, 1.68, 1.95, 2.22, 2.50
  ];
  const specColors = [
    { shirt: 0xc26a2b, pants: 0x22242a, skin: 0xd89c74 }, // Burnt Ochre
    { shirt: 0x3b4d66, pants: 0x2d3a4d, skin: 0x8d5534 }, // Slate Denim
    { shirt: 0xd49b35, pants: 0x22242a, skin: 0xf0c8a0 }, // Warm Mustard
    { shirt: 0x4a5d3f, pants: 0x283226, skin: 0xa86c48 }, // Olive Drab
    { shirt: 0x9e3328, pants: 0x22242a, skin: 0xe0b088 }, // Terracotta Crimson
    { shirt: 0xe8e2d4, pants: 0x3b4d66, skin: 0x5c3826 }, // Off-White / Cream
    { shirt: 0x22242a, pants: 0x342a22, skin: 0xd89c74 }  // Deep Charcoal
  ];

  const perimeterPropsGroup = new THREE.Group();
  perimeterPropsGroup.name = 'perimeter_barricades_group';
  scene.add(perimeterPropsGroup);

  barricadeAngles.forEach((ang, idx) => {
    const r = 6.8;
    const bar = createSteelBarricadeUnit();
    bar.position.set(Math.sin(ang) * r, 0, -Math.cos(ang) * r + 0.5);
    bar.lookAt(0, 0, 1.5);
    perimeterPropsGroup.add(bar);

    // Cheering Crowd Spectator behind South-sector barricades (West & East sectors are populated by animated crowdSpectators in kronos.js)
    if (idx % 2 === 0 && ang > 1.50) {
      const col = specColors[idx % specColors.length];
      const spec = buildSpectatorModel(col.shirt, col.pants, col.skin, idx);
      spec.root.scale.setScalar(0.85);
      const specR = r + 0.65;
      spec.root.position.set(Math.sin(ang) * specR, 0, -Math.cos(ang) * specR + 0.5);
      spec.root.lookAt(0, 0, 1.5);
      spec.torso.rotation.x = 0.12;
      spec.leftArm.rotation.set(-0.75 - (idx % 2) * 0.25, 0, -0.20);
      spec.rightArm.rotation.set(-2.25 - (idx % 3) * 0.15, 0, 0.22);
      if (spec.leftElbow) spec.leftElbow.rotation.set(-0.85, 0, 0);
      if (spec.rightElbow) spec.rightElbow.rotation.set(-0.40, 0, 0);
      perimeterPropsGroup.add(spec.root);
    }
  });

  // 7. Upgraded Dual-Color Clamped Power Cables (Yellow & Cyan at y = 0.035m)
  buildClampedPowerCables(scene);

  // 8. Overhead Crisscrossing Festival String Lights (West-East & North-South)
  const stringCoords = [
    [new THREE.Vector3(-8.2, 5.4, -2.5), new THREE.Vector3(0, 5.8, -0.5), new THREE.Vector3(8.2, 5.4, 0.5)],
    [new THREE.Vector3(0, 5.8, -4.5), new THREE.Vector3(0, 5.7, 1.5), new THREE.Vector3(0, 5.9, 7.8)]
  ];
  stringCoords.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const wireGeo = new THREE.TubeGeometry(curve, 20, 0.02, 6, false);
    perimeterPropsGroup.add(new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({ color: 0x09080c })));
    for (let i = 1; i <= 8; i++) {
      const pt = curve.getPoint(i / 9);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 10),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffe566 : 0x52f2ff })
      );
      bulb.position.copy(pt);
      bulb.position.y -= 0.08;
      perimeterPropsGroup.add(bulb);

      // Hanging triangular block-party festival pennant flags
      const flagGeo = new THREE.ConeGeometry(0.14, 0.30, 3);
      flagGeo.rotateX(Math.PI);
      const flag = new THREE.Mesh(
        flagGeo,
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff2a48 : (i % 3 === 1 ? 0xffd13b : 0x24e5ff) })
      );
      flag.position.copy(pt);
      flag.position.y -= 0.22;
      perimeterPropsGroup.add(flag);
    }
  });

  // 8B. 4 Urban Cast-Iron Street Lamp Posts with Glowing Warm Amber Lantern Globes
  [
    [-6.5, 0, -4.6],
    [7.4,  0, -3.6],
    [-6.6, 0,  5.8],
    [6.6,  0,  5.8]
  ].forEach(([lx, ly, lz]) => {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(lx, ly, lz);
    perimeterPropsGroup.add(lampGroup);

    const basePedestal = createHiFiMesh(new THREE.CylinderGeometry(0.18, 0.26, 0.65, 10), 0x1a1d28, 0.04);
    basePedestal.position.y = 0.325;
    lampGroup.add(basePedestal);

    const pole = createHiFiMesh(new THREE.CylinderGeometry(0.06, 0.09, 4.4, 10), 0x222634, 0.035);
    pole.position.y = 2.52;
    lampGroup.add(pole);

    const crossArm = createHiFiMesh(new THREE.BoxGeometry(0.85, 0.08, 0.08), 0x222634, 0.03);
    crossArm.position.y = 4.55;
    lampGroup.add(crossArm);

    [-0.36, 0.36].forEach((gx) => {
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe478 })
      );
      globe.position.set(gx, 4.72, 0);
      lampGroup.add(globe);
    });
  });

  mergeStaticGroupMeshes(perimeterPropsGroup);

  // 9. Update Arena Floor Mesh with Weathered Asphalt & Graffiti Texture + Bump Map + Baked AO & LightMap
  const asphaltTex = createWeatheredAsphaltArenaTexture();
  const courtBump = createCourtAsphaltBumpMap();
  const bakedAOTex = createBakedArenaAOMapTexture();
  const bakedLightMapTex = createBakedArenaLightMapTexture();
  scene.traverse((obj) => {
    if (obj.geometry && obj.geometry.type === 'CircleGeometry' && obj.geometry.parameters && obj.geometry.parameters.radius >= 20) {
      if (obj.material) {
        obj.material.map = asphaltTex;
        obj.material.bumpMap = courtBump;
        obj.material.bumpScale = 0.04;
        assignPlanarUV2(obj.geometry, null, 'xz');
        obj.material.aoMap = bakedAOTex;
        obj.material.aoMapIntensity = 1.0;
        obj.material.lightMap = bakedLightMapTex;
        obj.material.lightMapIntensity = 1.0;
        obj.material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            `
            #include <aomap_fragment>
            #ifdef USE_AOMAP
            reflectedLight.directDiffuse *= (ambientOcclusion * 0.65 + 0.35);
            #endif
            `
          );
        };
        obj.receiveShadow = true;
        obj.material.needsUpdate = true;
      }
    }
  });

  if (typeof window !== 'undefined' && window.floorMesh && window.floorMesh.material) {
    window.floorMesh.material.map = asphaltTex;
    window.floorMesh.material.bumpMap = courtBump;
    window.floorMesh.material.bumpScale = 0.04;
    window.floorMesh.material.aoMap = bakedAOTex;
    window.floorMesh.material.aoMapIntensity = 1.0;
    window.floorMesh.material.lightMap = bakedLightMapTex;
    window.floorMesh.material.lightMapIntensity = 1.0;
    if (window.floorMesh.geometry && !window.floorMesh.geometry.attributes.uv2) {
      assignPlanarUV2(window.floorMesh.geometry, null, 'xz');
    }
    window.floorMesh.material.needsUpdate = true;
  }
}

/**
 * Procedural Courtyard Cypher Floor with baked asphalt, bump, AO, and lightMap
 */
export function buildCourtyardFloor(scene) {
  const asphaltTex = createWeatheredAsphaltArenaTexture();
  const courtBump = createCourtAsphaltBumpMap();
  const bakedAOTex = createBakedArenaAOMapTexture();
  const bakedLightMapTex = createBakedArenaLightMapTexture();

  const floorGeom = new THREE.CircleGeometry(42, 64);
  assignPlanarUV2(floorGeom, null, 'xz');

  const floorMat = new THREE.MeshToonMaterial({
    map: asphaltTex,
    bumpMap: courtBump,
    bumpScale: 0.04,
    aoMap: bakedAOTex,
    aoMapIntensity: 1.0,
    lightMap: bakedLightMapTex,
    lightMapIntensity: 1.0
  });

  floorMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `
      #include <aomap_fragment>
      #ifdef USE_AOMAP
      reflectedLight.directDiffuse *= (ambientOcclusion * 0.65 + 0.35);
      #endif
      `
    );
  };

  const mesh = new THREE.Mesh(floorGeom, floorMat);
  mesh.name = 'floorMesh';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;

  if (scene) scene.add(mesh);
  if (typeof window !== 'undefined') window.floorMesh = mesh;
  return mesh;
}

// ============================================================================
// 6. CONCENTRIC FLOOR RHYTHM DIAL (1:1 MATCH WITH TARGET SCREENSHOT)
// ============================================================================
function createFloorDialTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.translate(512, 512);

  const glow = ctx.createRadialGradient(0, 0, 110, 0, 0, 490);
  glow.addColorStop(0.0, 'rgba(36, 229, 255, 0.18)');
  glow.addColorStop(0.42, 'rgba(255, 42, 64, 0.32)');
  glow.addColorStop(0.78, 'rgba(255, 215, 40, 0.38)');
  glow.addColorStop(1.0, 'rgba(255, 180, 0, 0.0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 490, 0, Math.PI * 2);
  ctx.fill();

  // 8 Long Outer Golden Compass Spikes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#ffe042';
    ctx.beginPath();
    ctx.moveTo(410, -10);
    ctx.lineTo(500, 0);
    ctx.lineTo(410, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Outer Glowing Golden Ring (#ffe042)
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 20;
  ctx.shadowColor = '#ffae00';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(0, 0, 400, 0, Math.PI * 2);
  ctx.stroke();

  // 64 Radial Beat Tick Marks inside the Golden Ring
  ctx.shadowBlur = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const isMajor = i % 4 === 0;
    const r0 = isMajor ? 338 : 358;
    const r1 = 384;
    ctx.lineWidth = isMajor ? 10 : 4;
    ctx.strokeStyle = isMajor ? '#ffe866' : '#ff9824';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }

  // Middle Glowing Crimson-Red Ring (#ff2a3c)
  ctx.strokeStyle = '#ff2a3c';
  ctx.lineWidth = 18;
  ctx.shadowColor = '#ff1e38';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.arc(0, 0, 298, 0, Math.PI * 2);
  ctx.stroke();

  // Inner Glowing Cyan Target Ring (#24e5ff)
  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 16;
  ctx.shadowColor = '#00d8ff';
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(0, 0, 174, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPerfectBadgeCanvas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  function drawBadge(label = 'PERFECT!', color = '#ffe042') {
    ctx.clearRect(0, 0, 512, 256);
    ctx.save();
    ctx.translate(256, 142);

    ctx.fillStyle = color;
    ctx.strokeStyle = '#080608';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, -118);
    ctx.lineTo(26, -78);
    ctx.lineTo(-26, -78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(20, 18, 28, 0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#080608';
    ctx.stroke();

    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '900 58px "Chakra Petch", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#080608';
    ctx.strokeText(label, 0, 4);
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 4);

    ctx.restore();
  }

  drawBadge('PERFECT!', '#ffffff');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, updateBadge: (txt, col) => { drawBadge(txt, col); tex.needsUpdate = true; } };
}

export function buildFloorRhythmDial(scene) {
  const dialGroup = new THREE.Group();
  dialGroup.position.y = 0.025;
  scene.add(dialGroup);

  const dialTex = createFloorDialTexture();
  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.65, 3.65),
    new THREE.MeshBasicMaterial({
      map: dialTex,
      transparent: true,
      opacity: 0.70,
      depthWrite: false
    })
  );
  basePlane.name = 'floor_dial_base_plane';
  basePlane.rotation.x = -Math.PI / 2;
  dialGroup.add(basePlane);

  const pulseGeo = new THREE.RingGeometry(0.66, 0.76, 48);
  pulseGeo.rotateX(-Math.PI / 2);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.70,
    depthWrite: false
  });
  const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
  pulseRing.name = 'floor_dial_pulse_ring';
  pulseRing.position.y = 0.01;
  dialGroup.add(pulseRing);

  const { tex: badgeTex, updateBadge } = createPerfectBadgeCanvas();
  const badgePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 0.66),
    new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      opacity: 0.70,
      depthWrite: false
    })
  );
  badgePlane.name = 'floor_dial_badge_plane';
  badgePlane.rotation.x = -Math.PI / 2;
  badgePlane.position.set(-0.32, 0.02, -0.125);
  dialGroup.add(badgePlane);

  // 3D Red Directional Threat Chevrons pointing toward active attackers
  const threatChevronGroup = new THREE.Group();
  threatChevronGroup.position.y = 0.03;
  threatChevronGroup.visible = true;
  dialGroup.add(threatChevronGroup);

  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0xff1e38,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });

  // 3 nested chevron arrows at radius ~1.15m, 1.40m, 1.65m pointing outward
  [1.15, 1.40, 1.65].forEach((dist, idx) => {
    const chevShape = new THREE.Shape();
    // V-shaped arrow pointing forward in -Z
    chevShape.moveTo(0, -0.16);
    chevShape.lineTo(0.22, 0.08);
    chevShape.lineTo(0.15, 0.16);
    chevShape.lineTo(0, -0.04);
    chevShape.lineTo(-0.15, 0.16);
    chevShape.lineTo(-0.22, 0.08);
    chevShape.closePath();

    const chevGeo = new THREE.ShapeGeometry(chevShape);
    chevGeo.rotateX(-Math.PI / 2);
    const chevMesh = new THREE.Mesh(chevGeo, chevronMat.clone());
    chevMesh.material.opacity = 0.50 + idx * 0.22;
    chevMesh.position.set(0, 0, -dist);
    threatChevronGroup.add(chevMesh);
  });

  return { dialGroup, basePlane, pulseRing, pulseMat, updateBadge, threatChevronGroup };
}

export function spawnStrikeSmearArc(scene, originPos, isKick = false) {
  const radius = isKick ? 1.45 : 1.10;
  const geo = new THREE.RingGeometry(radius * 0.58, radius, 24, 1, -Math.PI * 0.35, Math.PI * 0.85);
  const mat = new THREE.MeshBasicMaterial({
    color: isKick ? 0xffd15c : 0xff7b29,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(originPos);
  mesh.position.y += isKick ? 1.15 : 1.38;
  mesh.rotation.set(
    isKick ? -0.35 : -1.15,
    (Math.random() - 0.5) * 0.4,
    isKick ? 0.65 : -0.25
  );
  scene.add(mesh);
  return { mesh, life: 0.22 };
}

export function spawn3DImpactBurst(scene, contactPoint, vfxType = 'impact-sparks') {
  const group = new THREE.Group();
  group.position.copy(contactPoint);

  const isRing = vfxType === 'impact-ring';
  const color = isRing ? 0xff4899 : 0xffe066;

  // Expanding shockwave ring
  const ringGeo = new THREE.RingGeometry(0.08, 0.22, 16);
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  group.add(ringMesh);

  // Directional Spark Diamonds / Shards
  const sparkGeo = new THREE.OctahedronGeometry(0.06, 0);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });

  const sparks = [];
  const sparkCount = isRing ? 12 : 8;
  for (let i = 0; i < sparkCount; i++) {
    const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const speed = 2.4 + Math.random() * 2.2;
    const vel = new THREE.Vector3(
      Math.cos(angle) * speed,
      (Math.random() - 0.2) * 1.8,
      Math.sin(angle) * speed
    );
    const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
    m.scale.set(1.0, 1.8, 1.0);
    group.add(m);
    sparks.push({ mesh: m, vel });
  }

  scene.add(group);

  let life = 0.32;
  const maxLife = 0.32;

  return {
    group,
    update(dt, cameraPos) {
      life -= dt;
      if (life <= 0) return false;

      const progress = 1.0 - (life / maxLife);
      const ringScale = 1.0 + progress * (isRing ? 6.5 : 4.2);
      ringMesh.scale.set(ringScale, ringScale, ringScale);
      ringMesh.material.opacity = Math.max(0, 1.0 - progress * 1.1);

      if (cameraPos) {
        ringMesh.lookAt(cameraPos);
      }

      sparks.forEach(({ mesh, vel }) => {
        mesh.position.addScaledVector(vel, dt);
        vel.multiplyScalar(Math.max(0, 1.0 - dt * 6.0));
        mesh.material.opacity = Math.max(0, 1.0 - progress);
        mesh.rotation.x += dt * 10;
        mesh.rotation.y += dt * 8;
      });

      return true;
    },
    dispose(sceneRef) {
      if (sceneRef) {
        sceneRef.remove(group);
      } else if (scene) {
        scene.remove(group);
      }
      ringGeo.dispose();
      ringMat.dispose();
      sparkGeo.dispose();
      sparks.forEach(({ mesh }) => {
        if (mesh.material) mesh.material.dispose();
      });
    }
  };
}

// ============================================================================
// 6B. ZERO-ALLOCATION PRE-ALLOCATED 3D COMBAT VFX POOLS
// ============================================================================
export class ImpactBurstPool {
  constructor(scene, capacity = 8) {
    this.scene = scene;
    this.capacity = capacity;
    this.pool = [];
    this.activeCount = 0;

    // Shared geometries across all pooled bursts
    const ringGeo = new THREE.RingGeometry(0.08, 0.22, 16);
    const sparkGeo = new THREE.OctahedronGeometry(0.06, 0);

    for (let i = 0; i < capacity; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffe066,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      group.add(ringMesh);

      const sparks = [];
      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
      });

      for (let s = 0; s < 12; s++) {
        const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
        m.scale.set(1.0, 1.8, 1.0);
        m.visible = false;
        group.add(m);
        sparks.push({
          mesh: m,
          vel: new THREE.Vector3()
        });
      }

      this.scene.add(group);

      const self = this;
      const burstItem = {
        group,
        ringMesh,
        ringMat,
        sparks,
        sparkCount: 8,
        isRing: false,
        active: false,
        life: 0,
        maxLife: 0.32,
        update(dt, cameraPos) {
          if (!this.active) return false;
          this.life -= dt;
          if (this.life <= 0) {
            this.active = false;
            this.group.visible = false;
            self._recomputeActiveCount();
            return false;
          }
          const progress = 1.0 - (this.life / this.maxLife);
          const ringScale = 1.0 + progress * (this.isRing ? 6.5 : 4.2);
          this.ringMesh.scale.set(ringScale, ringScale, ringScale);
          this.ringMat.opacity = Math.max(0, 1.0 - progress * 1.1);
          if (cameraPos) {
            this.ringMesh.lookAt(cameraPos);
          }
          for (let s = 0; s < this.sparkCount; s++) {
            const spark = this.sparks[s];
            spark.mesh.position.addScaledVector(spark.vel, dt);
            spark.vel.multiplyScalar(Math.max(0, 1.0 - dt * 6.0));
            spark.mesh.material.opacity = Math.max(0, 1.0 - progress);
            spark.mesh.rotation.x += dt * 10;
            spark.mesh.rotation.y += dt * 8;
          }
          return true;
        },
        release() {
          this.active = false;
          this.group.visible = false;
          self._recomputeActiveCount();
        },
        dispose() {
          this.release();
        }
      };
      this.pool.push(burstItem);
    }
  }

  acquire(contactPoint, vfxType = 'impact-sparks') {
    let burst = null;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.pool[i].active) {
        burst = this.pool[i];
        break;
      }
    }
    // If all are active, steal the one with lowest remaining life
    if (!burst) {
      let minLife = Infinity;
      for (let i = 0; i < this.capacity; i++) {
        if (this.pool[i].life < minLife) {
          minLife = this.pool[i].life;
          burst = this.pool[i];
        }
      }
    }

    const isRing = vfxType === 'impact-ring';
    const color = isRing ? 0xff4899 : 0xffe066;
    const sparkCount = isRing ? 12 : 8;

    burst.isRing = isRing;
    burst.sparkCount = sparkCount;
    burst.group.position.copy(contactPoint);
    burst.ringMat.color.setHex(color);
    burst.ringMat.opacity = 0.95;
    burst.ringMesh.scale.set(1.0, 1.0, 1.0);
    burst.ringMesh.rotation.set(Math.PI / 2, 0, 0);

    for (let i = 0; i < 12; i++) {
      const spark = burst.sparks[i];
      if (i < sparkCount) {
        const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const speed = 2.4 + Math.random() * 2.2;
        spark.vel.set(
          Math.cos(angle) * speed,
          (Math.random() - 0.2) * 1.8,
          Math.sin(angle) * speed
        );
        spark.mesh.position.set(0, 0, 0);
        spark.mesh.rotation.set(0, 0, 0);
        spark.mesh.material.opacity = 1.0;
        spark.mesh.visible = true;
      } else {
        spark.mesh.visible = false;
      }
    }

    burst.life = 0.32;
    burst.maxLife = 0.32;
    burst.active = true;
    burst.group.visible = true;
    this._recomputeActiveCount();
    return burst;
  }

  update(dt, cameraPos) {
    let activeFound = 0;
    for (let i = 0; i < this.capacity; i++) {
      const burst = this.pool[i];
      if (burst.active && burst.update(dt, cameraPos)) {
        activeFound++;
      }
    }
    this.activeCount = activeFound;
  }

  _recomputeActiveCount() {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.pool[i].active) count++;
    }
    this.activeCount = count;
  }

  getActiveCount() {
    return this.activeCount;
  }
}

export class SmearArcPool {
  constructor(scene, capacity = 4) {
    this.scene = scene;
    this.capacity = capacity;
    this.pool = [];
    this.activeCount = 0;

    const punchGeo = new THREE.RingGeometry(1.10 * 0.58, 1.10, 24, 1, -Math.PI * 0.35, Math.PI * 0.85);
    const kickGeo = new THREE.RingGeometry(1.45 * 0.58, 1.45, 24, 1, -Math.PI * 0.35, Math.PI * 0.85);

    for (let i = 0; i < capacity; i++) {
      const isKickDefault = i >= Math.floor(capacity / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: isKickDefault ? 0xffd15c : 0xff7b29,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(isKickDefault ? kickGeo : punchGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);

      const self = this;
      const smearItem = {
        mesh,
        mat,
        punchGeo,
        kickGeo,
        isKick: isKickDefault,
        active: false,
        life: 0,
        maxLife: 0.22,
        update(dt) {
          if (!this.active) return false;
          this.life -= dt;
          if (this.life <= 0) {
            this.release();
            return false;
          }
          const progress = 1.0 - (this.life / this.maxLife);
          this.mat.opacity = Math.max(0, (this.life / this.maxLife) * 0.92);
          const sweepScale = 0.72 + progress * 0.58;
          this.mesh.scale.set(sweepScale, sweepScale, 1.0);
          this.mesh.rotation.z += dt * (this.isKick ? 4.8 : -4.2);
          return true;
        },
        release() {
          this.active = false;
          this.mesh.visible = false;
          self._recomputeActiveCount();
        }
      };
      this.pool.push(smearItem);
    }
  }

  acquire(originPos, isKick = false) {
    let smear = null;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.pool[i].active && this.pool[i].isKick === isKick) {
        smear = this.pool[i];
        break;
      }
    }
    if (!smear) {
      for (let i = 0; i < this.capacity; i++) {
        if (!this.pool[i].active) {
          smear = this.pool[i];
          break;
        }
      }
    }
    if (!smear) {
      let minLife = Infinity;
      for (let i = 0; i < this.capacity; i++) {
        if (this.pool[i].life < minLife) {
          minLife = this.pool[i].life;
          smear = this.pool[i];
        }
      }
    }

    smear.isKick = isKick;
    smear.mesh.geometry = isKick ? smear.kickGeo : smear.punchGeo;
    smear.mat.color.setHex(isKick ? 0xffd15c : 0xff7b29);
    smear.mat.opacity = 0.92;
    smear.mesh.scale.set(0.72, 0.72, 1.0);
    smear.mesh.position.copy(originPos);
    smear.mesh.position.y += isKick ? 1.12 : 1.36;
    smear.mesh.position.z -= 0.25;
    smear.mesh.rotation.set(
      isKick ? -0.42 : -1.15,
      -0.18,
      isKick ? -0.45 : 0.35
    );

    smear.life = 0.22;
    smear.maxLife = 0.22;
    smear.active = true;
    smear.mesh.visible = true;
    this._recomputeActiveCount();
    return smear;
  }

  update(dt) {
    let activeFound = 0;
    for (let i = 0; i < this.capacity; i++) {
      const smear = this.pool[i];
      if (smear.active && smear.update(dt)) {
        activeFound++;
      }
    }
    this.activeCount = activeFound;
  }

  _recomputeActiveCount() {
    let count = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.pool[i].active) count++;
    }
    this.activeCount = count;
  }

  getActiveCount() {
    return this.activeCount;
  }
}


export function buildSubwooferShockwaveRing() {
  const geo = new THREE.RingGeometry(0.25, 0.55, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffe042,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}


export const createUrbanArena = buildArenaEnvironment;
export const createArenaGround = createWeatheredAsphaltArenaTexture;
export const createAsphaltFloorTexture = createWeatheredAsphaltArenaTexture;
export const createShockwaveRing = buildSubwooferShockwaveRing;
