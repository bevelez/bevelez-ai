import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Load authentic Mountain View GIS dataset
let mvGisData = null;
try {
  const gisRes = await fetch('./assets/mountain-view-gis.json');
  if (gisRes.ok) {
    mvGisData = await gisRes.json();
  }
} catch (e) {
  console.warn('GIS data load notice:', e);
}

// ============================================================================
// 0. DETERMINISTIC PRNG & GEOGRAPHIC CONSTANTS (MOUNTAIN VIEW, CA)
// ============================================================================
function createSeededRandom(seed = 94041) {
  let s = seed >>> 0;
  return function rand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const MV_GEO = {
  refLon: -122.0839,
  refLat: 37.3861,
  midLon: mvGisData ? (mvGisData.bounds.minLon + mvGisData.bounds.maxLon) * 0.5 : -122.080,
  midLat: mvGisData ? (mvGisData.bounds.minLat + mvGisData.bounds.maxLat) * 0.5 : 37.400,
  latSpan: mvGisData ? (mvGisData.bounds.maxLat - mvGisData.bounds.minLat) : 0.090,
  lonSpan: mvGisData ? (mvGisData.bounds.maxLon - mvGisData.bounds.minLon) : 0.080,
  tableSize: 136
};

const cosRefLat = Math.cos((MV_GEO.refLat * Math.PI) / 180.0);
const m_per_deg_lat = 111000.0;
const m_per_deg_lon = 111000.0 * cosRefLat;
const scale_m = (MV_GEO.tableSize * 0.90) / (MV_GEO.latSpan * m_per_deg_lat);
const x_offset = (MV_GEO.midLon - MV_GEO.refLon) * m_per_deg_lon * scale_m;
const z_offset = (MV_GEO.midLat - MV_GEO.refLat) * m_per_deg_lat * scale_m;

function geoToScene(lon, lat) {
  const dx = (lon - MV_GEO.refLon) * m_per_deg_lon;
  const x = dx * scale_m - x_offset;
  const z = -((lat - MV_GEO.refLat) * m_per_deg_lat) * scale_m + z_offset;
  return { x, z };
}

function sceneToGeo(x, z) {
  const dx = (x + x_offset) / scale_m;
  const lon = MV_GEO.refLon + dx / m_per_deg_lon;
  const dz = -(z - z_offset) / scale_m;
  const lat = MV_GEO.refLat + dz / m_per_deg_lat;
  return { lat, lon };
}

function worldToLatLon(wx, wz) {
  return sceneToGeo(wx, wz);
}

// Zoning Envelope Definitions
const ZONE_DEFS = {
  R1: {
    code: 'R-1 LOW',
    label: 'Single-Family / ADU Gentle Density',
    baseFar: 0.55,
    heightScale: 0.55,
    unitsPerArea: 0.35,
    jobsPerArea: 0.05,
    greenFactor: 0.28,
    colorHex: 0xe6e4de
  },
  R3: {
    code: 'R-3 MID',
    label: 'Missing-Middle Courtyard Housing',
    baseFar: 1.65,
    heightScale: 1.25,
    unitsPerArea: 1.35,
    jobsPerArea: 0.22,
    greenFactor: 0.24,
    colorHex: 0xeeece6
  },
  MU6: {
    code: 'CRA-MU6',
    label: 'Mixed-Use Corridor Podium (4–6 Stories)',
    baseFar: 2.8,
    heightScale: 2.05,
    unitsPerArea: 2.4,
    jobsPerArea: 1.6,
    greenFactor: 0.20,
    colorHex: 0xf4f1ea
  },
  TOD10: {
    code: 'TOD-10',
    label: 'High-Density Transit-Oriented Tower (8–12 Stories)',
    baseFar: 4.5,
    heightScale: 3.35,
    unitsPerArea: 4.2,
    jobsPerArea: 2.8,
    greenFactor: 0.26,
    colorHex: 0xfaf7f0
  },
  PARK: {
    code: 'OS-ECO',
    label: 'Restored Riparian Park & Bioswale',
    baseFar: 0.05,
    heightScale: 0.12,
    unitsPerArea: 0.0,
    jobsPerArea: 0.04,
    greenFactor: 0.92,
    colorHex: 0x28a86b
  }
};

// 5-Layer AI-Native Web Digital Twin Architecture Stack
const ARCHITECTURE_STACK = {
  layer1_gis: {
    id: 1,
    name: 'Geospatial & Base 3D (GIS)',
    role: 'Authoritative spatial schemas, parcel boundaries, terrain, and existing city meshes',
    stack: 'PostGIS + DuckDB Spatial, Google Photorealistic 3D Tiles, OpenStreetMap (OSM)'
  },
  layer2_viewport: {
    id: 2,
    name: '3D Viewport & Rendering',
    role: 'Interactive visualization, shaders, and procedural massing in the browser',
    stack: 'CesiumJS + Deck.gl + Three.js (WebGPU), Blender (headless Geometry Nodes)'
  },
  layer3_ingestion: {
    id: 3,
    name: 'Live Ingestion & State',
    role: 'Real-time feeds that make the model a living twin rather than a static snapshot',
    stack: 'GTFS-Realtime (transit), MQTT / Cloud Pub/Sub, TimescaleDB (time-series sensor data)'
  },
  layer4_physics: {
    id: 4,
    name: 'Simulation & Physics',
    role: 'Domain math for traffic, pedestrian flow, solar shadows, and microclimates',
    stack: 'SUMO (open-source traffic sim), WebGPU Compute Shaders (solar/wind/viewshed), NetworkX / Pandana'
  },
  layer5_orchestration: {
    id: 5,
    name: 'Intelligence & Orchestration',
    role: 'Natural-language scenario planning, regulatory compliance, and procedural code generation',
    stack: 'Gemini 4 Argon API + Gemini Managed Agents + MCP (Model Context Protocol)'
  }
};

// Curated What-If Scenarios
const SCENARIO_PRESETS = {
  baseline: {
    id: 'baseline',
    name: '2026 Baseline',
    farCap: 2.4,
    transitShare: 25,
    canopyMandate: 16.4,
    baySurge: 0.0,
    districtMultipliers: {
      NB_PP: 1.0,
      DT_CRA: 1.0,
      ECR_MU: 1.0,
      EW_TOD: 1.0,
      RES_SF: 1.0
    },
    summary:
      '[LOCAL NL-TO-GIS COMPILER] Baseline 2026 loaded: US-101 V/C 0.88 (High), ECR 0.64 (Moderate).'
  },
  bayshore: {
    id: 'bayshore',
    name: 'North Bayshore Complete Community',
    farCap: 4.2,
    transitShare: 48,
    canopyMandate: 28,
    baySurge: 0.0,
    districtMultipliers: {
      NB_PP: 2.45,
      DT_CRA: 1.25,
      ECR_MU: 1.15,
      EW_TOD: 1.3,
      RES_SF: 1.05
    },
    summary:
      '[LOCAL NL-TO-GIS COMPILER] North Bayshore Precise Plan: +7,240 residential units around Bay View & Shoreline; 48% electrified transit mode share cuts US-101 V/C to Moderate.'
  },
  elcamino: {
    id: 'elcamino',
    name: 'El Camino Grand Blvd & Castro TOD',
    farCap: 4.8,
    transitShare: 58,
    canopyMandate: 24,
    baySurge: 0.0,
    districtMultipliers: {
      NB_PP: 1.35,
      DT_CRA: 2.15,
      ECR_MU: 2.4,
      EW_TOD: 1.85,
      RES_SF: 1.15
    },
    summary:
      '[LOCAL NL-TO-GIS COMPILER] El Camino Real & Castro TOD: 6–8 story podiums along SR-82 + 8-min electrified Caltrain headways shift 58% of trips to rail/BRT.'
  },
  eastwhisman: {
    id: 'eastwhisman',
    name: 'East Whisman & Downtown Intensification',
    farCap: 4.5,
    transitShare: 52,
    canopyMandate: 22,
    baySurge: 0.0,
    districtMultipliers: {
      NB_PP: 1.25,
      DT_CRA: 2.2,
      ECR_MU: 1.4,
      EW_TOD: 2.65,
      RES_SF: 1.1
    },
    summary:
      '[LOCAL NL-TO-GIS COMPILER] East Whisman & Downtown Intensification: High-density mixed-use TOD along VTA Light Rail & Castro St corridor; +5,400 transit-oriented homes.'
  },
  sponge: {
    id: 'sponge',
    name: 'Net-Zero Sponge City 2040',
    farCap: 3.8,
    transitShare: 64,
    canopyMandate: 38,
    baySurge: 1.2,
    districtMultipliers: {
      NB_PP: 1.85,
      DT_CRA: 1.65,
      ECR_MU: 1.75,
      EW_TOD: 2.1,
      RES_SF: 1.2
    },
    summary:
      '[LOCAL NL-TO-GIS COMPILER] Sponge City 2040 (+1.2m SF Bay king-tide surge): Charleston Slough levee & Stevens Creek bioswales capture runoff; 38% solar canopy cools UHI by -1.9°C.'
  }
};
SCENARIO_PRESETS.whisman = SCENARIO_PRESETS.eastwhisman;

// ============================================================================
// 1. AMBIENT ARCHITECTURAL SOUNDSCAPE & SONIFICATION ENGINE
// ============================================================================
class TwinAudioEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.chordTimer = null;
    this.stepIdx = 0;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.18;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTelemetryChime(baseFreq = 523.25) {
    if (!this.ctx || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      gain.gain.setValueAtTime(0.001, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.055, now + i * 0.045 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + i * 0.045 + 0.42);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.45);
    });
  }

  toggle() {
    this.initContext();
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.startAmbientLoop();
      this.playTelemetryChime(587.33);
    } else if (this.chordTimer) {
      clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    return this.isPlaying;
  }

  startAmbientLoop() {
    if (this.chordTimer) clearInterval(this.chordTimer);
    const chords = [
      [174.61, 261.63, 329.63, 392.00, 493.88],
      [196.00, 293.66, 369.99, 440.00, 587.33],
      [130.81, 261.63, 329.63, 392.00, 493.88],
      [146.83, 220.00, 293.66, 369.99, 440.00]
    ];

    const triggerPad = () => {
      if (!this.isPlaying || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = chords[this.stepIdx % chords.length];
      this.stepIdx++;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(920, now);

        gain.gain.setValueAtTime(0.0005, now);
        gain.gain.linearRampToValueAtTime(0.028 / (idx * 0.35 + 1), now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.0006, now + 5.6);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 5.8);
      });
    };

    triggerPad();
    this.chordTimer = setInterval(triggerPad, 5200);
  }
}

// ============================================================================
// 2. LAYER 4: MULTI-PHYSICS SIMULATION ENGINES (CAPACITY, BPR TRAFFIC, SOLAR, FLOOD)
// ============================================================================
class SimulationEngines {
  constructor() {
    this.activeScenarioId = 'baseline';
    this.params = {
      farCap: 2.4,
      transitShare: 25,
      canopyMandate: 16.4,
      baySurge: 0.0
    };
    this.districtMultipliers = { ...SCENARIO_PRESETS.baseline.districtMultipliers };
    this.parcelOverrides = new Map();
  }

  // Domain Math Engine 1: Real Zoning & Capacity Math from GIS Footprints
  computeCapacity(districtId, deltaFar = 1.0, unitType = 'mixed') {
    const districtKeyMap = {
      'NB_PP': 'North Bayshore',
      'EW_TOD': 'East Whisman',
      'ECR_MU': 'El Camino Real',
      'SA_PP': 'San Antonio',
      'SA': 'San Antonio',
      'DT_CRA': 'Downtown Castro',
      'North Bayshore': 'North Bayshore',
      'East Whisman': 'East Whisman',
      'El Camino Real': 'El Camino Real',
      'San Antonio': 'San Antonio',
      'Downtown Castro': 'Downtown Castro'
    };
    const targetDistrict = districtKeyMap[districtId] || districtId;
    const buildings = (mvGisData && mvGisData.buildings) ? mvGisData.buildings : [];
    const matched = buildings.filter((b) => b.district === targetDistrict);

    let totalFootprintM2 = 0;
    for (const b of matched) {
      totalFootprintM2 += (b.area_m2 || 0);
    }
    if (totalFootprintM2 === 0) {
      const fallbackAreas = {
        'North Bayshore': 781977,
        'East Whisman': 420945,
        'El Camino Real': 348945,
        'San Antonio': 222415,
        'Downtown Castro': 71860
      };
      totalFootprintM2 = fallbackAreas[targetDistrict] || 250000;
    }

    const addedFloorAreaM2 = Math.round(totalFootprintM2 * Math.max(0, deltaFar));

    // Precise Plan residential vs commercial yields
    const resShareMap = {
      'North Bayshore': 0.65,
      'El Camino Real': 0.75,
      'San Antonio': 0.70,
      'East Whisman': 0.60,
      'Downtown Castro': 0.50
    };
    const fRes = resShareMap[targetDistrict] || 0.60;
    const avgUnitM2 = 85.0; // 915 sq ft gross per unit
    const avgJobM2 = 26.0;  // 280 sq ft gross per job

    const addedUnits = Math.round((addedFloorAreaM2 * fRes) / avgUnitM2);
    const addedJobs = Math.round((addedFloorAreaM2 * (1 - fRes)) / avgJobM2);
    const baselineUnits = 37800;
    const newTotalUnits = baselineUnits + addedUnits;
    const rhnaProgressPct = +((addedUnits / 11135) * 100).toFixed(1);

    return {
      districtId,
      districtName: targetDistrict,
      buildingCount: matched.length,
      totalFootprintM2: Math.round(totalFootprintM2),
      addedFloorAreaM2,
      addedUnits,
      addedJobs,
      newTotalUnits,
      rhnaProgressPct
    };
  }

  // Domain Math Engine 2: Bureau of Public Roads (BPR) Delay & HCM LOS Engine
  computeCorridorTraffic(corridorKey, unitGrowthDelta = 0, transitModeShare = 25) {
    const corridorDefs = {
      us101: {
        key: 'us101',
        name: 'US-101 Bayshore Fwy',
        baseVc: 0.88,
        capacity: 7800,
        baseVolume: 6864,
        t0: 3.97,
        lengthMiles: 4.3,
        freeFlowSpeedMph: 65,
        mitigationFactor: 1.0
      },
      sr85: {
        key: 'sr85',
        name: 'SR-85 South Fwy',
        baseVc: 0.72,
        capacity: 5400,
        baseVolume: 3888,
        t0: 3.51,
        lengthMiles: 3.8,
        freeFlowSpeedMph: 65,
        mitigationFactor: 0.85
      },
      sr237: {
        key: 'sr237',
        name: 'SR-237 South Bay Fwy',
        baseVc: 0.78,
        capacity: 5200,
        baseVolume: 4056,
        t0: 3.00,
        lengthMiles: 3.0,
        freeFlowSpeedMph: 60,
        mitigationFactor: 0.90
      },
      ecr: {
        key: 'ecr',
        name: 'El Camino Real (SR-82)',
        baseVc: 0.64,
        capacity: 2600,
        baseVolume: 1664,
        t0: 6.51,
        lengthMiles: 3.8,
        freeFlowSpeedMph: 35,
        mitigationFactor: 0.92
      },
      central: {
        key: 'central',
        name: 'Central Expressway',
        baseVc: 0.68,
        capacity: 3200,
        baseVolume: 2176,
        t0: 5.07,
        lengthMiles: 3.8,
        freeFlowSpeedMph: 45,
        mitigationFactor: 0.88
      },
      shoreline: {
        key: 'shoreline',
        name: 'Shoreline Boulevard',
        baseVc: 0.84,
        capacity: 2200,
        baseVolume: 1848,
        t0: 4.46,
        lengthMiles: 2.6,
        freeFlowSpeedMph: 35,
        mitigationFactor: 1.05
      }
    };

    corridorDefs.central_expy = corridorDefs.central;
    corridorDefs['central-expy'] = corridorDefs.central;

    const def = corridorDefs[corridorKey] || corridorDefs.us101;

    // Demand growth scalar & transit mode share mitigation
    const demandGrowth = Math.max(0.75, 1.0 + unitGrowthDelta / 37800);
    const transitMitigation = (transitModeShare - 25) * 0.0085 * def.mitigationFactor;

    // Volume / Capacity Ratio (V/C)
    const rawVc = +(def.baseVc * demandGrowth - transitMitigation).toFixed(2);
    const vc = Math.max(0.28, Math.min(1.35, rawVc));

    // Bureau of Public Roads (BPR) Delay Equation:
    // t = t0 * [1 + 0.15 * (V/C)^4]
    const alpha = 0.15;
    const beta = 4.0;
    const travelTimeMin = +(def.t0 * (1 + alpha * Math.pow(vc, beta))).toFixed(2);
    const delayMin = +(travelTimeMin - def.t0).toFixed(2);
    const speedMph = +(def.lengthMiles / (travelTimeMin / 60)).toFixed(1);

    // Highway Capacity Manual (HCM) LOS
    let los = 'A';
    if (vc > 1.00) los = 'F';
    else if (vc > 0.90) los = 'E';
    else if (vc > 0.80) los = 'D';
    else if (vc > 0.70) los = 'C';
    else if (vc > 0.60) los = 'B';
    else los = 'A';

    // Backward-compatible classification for tests
    let label = 'Low';
    let cls = 'status-low';
    let speedFactor = 1.35;
    if (vc >= 0.82) {
      label = 'High';
      cls = 'status-high';
      speedFactor = 0.48;
    } else if (vc >= 0.56) {
      label = 'Moderate';
      cls = 'status-moderate';
      speedFactor = 0.85;
    }

    return {
      key: def.key,
      name: def.name,
      vc,
      label,
      los,
      cls,
      speedFactor,
      delayMin,
      travelTimeMin,
      speedMph,
      freeFlowSpeedMph: def.freeFlowSpeedMph,
      capacity: def.capacity,
      volume: Math.round(def.capacity * vc)
    };
  }

  // Domain Math Engine 3: Astronomical Solar Azimuth/Altitude & Rooftop PV Physics
  computeSolarPhysics(dateOrHour = 14.0) {
    const lat = 37.3861;
    const lon = -122.0839;
    const latRad = (lat * Math.PI) / 180.0;

    let hour = typeof dateOrHour === 'number' ? dateOrHour : 14.0;
    let dayOfYear = 172; // Summer solstice benchmark
    if (dateOrHour instanceof Date) {
      hour = dateOrHour.getHours() + dateOrHour.getMinutes() / 60;
      const start = new Date(dateOrHour.getFullYear(), 0, 0);
      const diff = dateOrHour - start;
      dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);

    // Solar declination (Spencer formula)
    const declinationRad = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma);

    // Equation of time in minutes
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));

    const timeOffset = eqtime + 4 * lon - 60 * (-7); // PDT UTC-7
    const tst = hour * 60 + timeOffset;
    const haDeg = (tst / 4) - 180;
    const haRad = (haDeg * Math.PI) / 180;

    // Solar altitude
    const sinAlt = Math.sin(latRad) * Math.sin(declinationRad) + Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(haRad);
    const altitudeRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    // Solar azimuth
    const cosAz = (Math.sin(declinationRad) - Math.sin(latRad) * sinAlt) / (Math.cos(latRad) * Math.cos(altitudeRad));
    let azimuthRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (haDeg > 0) azimuthRad = 2 * Math.PI - azimuthRad;

    // Three.js sun vector (+Y up, +X East, -Z North)
    const cosAlt = Math.cos(altitudeRad);
    const sunX = Math.sin(azimuthRad) * cosAlt;
    const sunY = Math.max(0.12, Math.sin(altitudeRad));
    const sunZ = -Math.cos(azimuthRad) * cosAlt;

    const shadowLengthMult = +(1 / Math.max(0.15, Math.tan(Math.max(0.1, altitudeRad)))).toFixed(2);

    // Rooftop solar potential in MW
    const liveDni = (typeof telemetryPipeline !== 'undefined' && telemetryPipeline && telemetryPipeline.weatherData && telemetryPipeline.weatherData.solarDni) || 780;
    const totalRoofAreaM2 = 1850000;
    const pvEfficiency = 0.20;
    const prFactor = 0.80;
    const usableRoofFraction = 0.65;
    let rooftopPvMw = Math.round(
      (totalRoofAreaM2 * usableRoofFraction * liveDni * pvEfficiency * prFactor) / 1000000
    );
    if (altitudeRad <= 0) {
      rooftopPvMw = 0;
    }

    return {
      altitudeRad: +altitudeRad.toFixed(3),
      azimuthRad: +azimuthRad.toFixed(3),
      altitudeDeg: +(altitudeRad * 180 / Math.PI).toFixed(1),
      azimuthDeg: +(azimuthRad * 180 / Math.PI).toFixed(1),
      sunVector: [sunX, sunY, sunZ],
      shadowLengthMult,
      rooftopPvMw,
      liveDni
    };
  }

  // Domain Math Engine 4: SF Bay Storm Surge Inundation Physics
  computeFloodInundation(tideLevelM = 1.72, stormSurgeM = 0.0) {
    const totalWaterElevM = +(tideLevelM + Math.max(0, stormSurgeM)).toFixed(2);
    const grid = (mvGisData && mvGisData.elevation_grid && mvGisData.elevation_grid.elevations) || [];

    let floodedCells = 0;
    let totalCells = 0;
    for (const row of grid) {
      for (const elev of row) {
        totalCells++;
        if (elev <= totalWaterElevM) {
          floodedCells++;
        }
      }
    }
    const cellRatio = totalCells > 0 ? (floodedCells / totalCells) : 0;
    const cityTotalAreaM2 = 31700000; // ~31.7 km² municipal boundary
    const floodedAreaM2 = Math.round(cityTotalAreaM2 * cellRatio);

    // Building inundation test based on elevation
    const buildings = (mvGisData && mvGisData.buildings) || [];
    let inundatedBuildingCount = 0;
    for (const b of buildings) {
      if (b.center && b.center[1] >= 37.42) {
        const estElev = Math.max(0, (b.center[1] - 37.42) * 50);
        if (estElev <= totalWaterElevM) {
          inundatedBuildingCount++;
        }
      }
    }

    const floodedCorridors = [];
    if (totalWaterElevM >= 2.5) floodedCorridors.push('Shoreline Blvd (Low-lying Bayfront)');
    if (totalWaterElevM >= 3.2) floodedCorridors.push('US-101 Near Charleston Slough');

    return {
      tideLevelM,
      stormSurgeM,
      totalWaterElevM,
      floodedCells,
      totalCells,
      floodedAreaM2,
      inundatedBuildingCount,
      floodedCorridors
    };
  }

  evaluateState(parcels) {
    let totalUnits = 0;
    let totalJobs = 0;
    let weightedGreen = 0;
    let totalAreaWeight = 0;

    const farFactor = this.params.farCap / 2.4;

    for (const p of parcels) {
      const overrideZone = this.parcelOverrides.get(p.id);
      const zoneDef = ZONE_DEFS[overrideZone || p.baseZone] || ZONE_DEFS.MU6;
      const distMult = this.districtMultipliers[p.district] || 1.0;

      const effectiveScale = overrideZone
        ? zoneDef.heightScale * (0.75 + 0.25 * farFactor)
        : p.baseHeightScale * distMult * (0.55 + 0.45 * farFactor);

      p.targetHeight = Math.max(0.35, Math.min(13.5, p.origHeight * effectiveScale));
      p.targetFar = +(zoneDef.baseFar * distMult * (0.65 + 0.35 * farFactor)).toFixed(2);
      p.currentZoneCode = zoneDef.code;
      p.currentZoneKey = overrideZone || p.baseZone;

      const footprintFactor = (p.w * p.d) / 6.5;
      p.units = Math.round(
        p.currentZoneKey === 'PARK'
          ? 0
          : Math.max(4, footprintFactor * zoneDef.unitsPerArea * distMult * (0.6 + 0.4 * farFactor) * 18)
      );
      p.jobs = Math.round(
        footprintFactor * zoneDef.jobsPerArea * distMult * (0.7 + 0.3 * farFactor) * 26
      );

      const canopyBonus = (this.params.canopyMandate - 16.4) * 0.012;
      p.greenRatio = Math.min(0.95, Math.max(0.08, zoneDef.greenFactor + canopyBonus));
      p.heatDelta = +((1 - p.greenRatio) * 2.4 - (this.params.canopyMandate - 16.4) * 0.085).toFixed(2);
      p.floodRisk = Math.max(0, Math.min(1, (this.params.baySurge - p.elevationThreshold) / 1.2));

      totalUnits += p.units;
      totalJobs += p.jobs;
      weightedGreen += p.greenRatio * footprintFactor;
      totalAreaWeight += footprintFactor;
    }

    const rawBaselineUnits = this._baselineUnitsRef || totalUnits;
    if (!this._baselineUnitsRef) {
      this._baselineUnitsRef = totalUnits;
    }
    const unitScale = 37800 / Math.max(1, rawBaselineUnits);
    const rawDelta = Math.round(totalUnits * unitScale) - 37800;
    const rhnaDelta = Math.round(rawDelta * 0.38);
    const calibratedUnits = 37800 + rhnaDelta;
    const population = Math.round(81500 + rhnaDelta * 2.12);
    const calibratedJobs = Math.round(109600 * (totalJobs / Math.max(1, this._baselineJobsRef || totalJobs)));
    if (!this._baselineJobsRef) {
      this._baselineJobsRef = totalJobs;
    }

    const jobsHousingRatio = +(calibratedJobs / Math.max(1, calibratedUnits)).toFixed(2);

    const avgGreen = weightedGreen / Math.max(1, totalAreaWeight);
    if (!this._baselineGreenRef) {
      this._baselineGreenRef = avgGreen;
    }
    const overrideValues = Array.from(this.parcelOverrides.values());
    const parkOverrideCount = overrideValues.filter((v) => v === 'PARK').length;
    const todOverrideCount = overrideValues.filter((v) => v === 'TOD10').length;
    const greenspacePct = +(
      this.params.canopyMandate +
      parkOverrideCount * 0.45 +
      (avgGreen - this._baselineGreenRef) * 8.0
    ).toFixed(1);

    const effectiveTransitShare = Math.min(
      85.0,
      +(this.params.transitShare + todOverrideCount * 0.35).toFixed(1)
    );

    // Compute All 6 Corridors via BPR Engine
    const c101 = this.computeCorridorTraffic('us101', rhnaDelta, effectiveTransitShare);
    const cEcr = this.computeCorridorTraffic('ecr', rhnaDelta, effectiveTransitShare);
    const cSr85 = this.computeCorridorTraffic('sr85', rhnaDelta, effectiveTransitShare);
    const cSr237 = this.computeCorridorTraffic('sr237', rhnaDelta, effectiveTransitShare);
    const cCentral = this.computeCorridorTraffic('central', rhnaDelta, effectiveTransitShare);
    const cShoreline = this.computeCorridorTraffic('shoreline', rhnaDelta, effectiveTransitShare);

    const caltrainHeadway = Math.max(5, Math.round(15 - (effectiveTransitShare / 100) * 11));
    const caltrainBoardingsK = +(32 + (effectiveTransitShare - 15) * 0.42 + rhnaDelta * 0.0012).toFixed(1);
    const clampedGreenPct = Math.max(10.0, Math.min(65.0, greenspacePct));
    const solarPhysics = this.computeSolarPhysics();
    const canopySolarBonus = Math.round((clampedGreenPct - 16.4) * 4.2 + Math.max(0, rhnaDelta) * 0.004);
    const solarMw = Math.max(0, solarPhysics.rooftopPvMw + canopySolarBonus);
    const runoffCapturePct = Math.max(35, Math.min(96, Math.round(62 + (clampedGreenPct - 16.4) * 1.15)));
    const uhiDelta = +(-(clampedGreenPct - 16.4) * 0.095 + (this.params.farCap - 2.4) * 0.08).toFixed(1);

    const tideLevelM = (typeof telemetryPipeline !== 'undefined' && telemetryPipeline && telemetryPipeline.tideData && telemetryPipeline.tideData.waterLevelM) || 1.72;
    const flood = this.computeFloodInundation(tideLevelM, this.params.baySurge);

    return {
      scenarioId: this.activeScenarioId,
      population,
      housingUnits: calibratedUnits,
      rhnaDelta,
      rhnaTarget: 11135,
      rhnaProgressPct: +((Math.max(0, rhnaDelta) / 11135) * 100).toFixed(1),
      jobs: calibratedJobs,
      jobsHousingRatio,
      greenspacePct: clampedGreenPct,
      solarMw,
      runoffCapturePct,
      uhiDelta,
      baySurge: this.params.baySurge,
      transitShare: effectiveTransitShare,
      caltrainHeadway,
      caltrainBoardingsK,
      corridors: {
        us101: c101,
        ecr: cEcr,
        sr85: cSr85,
        sr237: cSr237,
        central: cCentral,
        shoreline: cShoreline
      },
      flood: {
        totalWaterElevM: flood.totalWaterElevM,
        floodedAreaM2: flood.floodedAreaM2,
        inundatedBuildingCount: flood.inundatedBuildingCount,
        floodedCorridors: flood.floodedCorridors
      }
    };
  }
}

// ============================================================================
// 3. LAYER 3: LIVE INGESTION & STATE PIPELINE (OPEN-METEO, NOAA 9414523, CALTRAIN)
// ============================================================================
class TelemetryPipeline {
  constructor() {
    this.subscribers = [];
    this.history = [];
    this.latestSnapshot = null;
    this.tickCount = 0;

    // Real-Time Telemetry Initial States (Climatological & NOAA Datum Fallbacks)
    this.weatherData = {
      tempC: 21.5,
      tempF: 70.7,
      humidity: 45,
      solarDni: 780.0,
      solarGhi: 650.0,
      windKph: 12.0,
      windDir: 310,
      timestamp: Date.now(),
      source: 'Open-Meteo Climatological Baseline',
      isLive: false,
      provenance: 'PUBLISHED BASELINE'
    };

    this.tideData = {
      waterLevelM: 1.72,
      stationId: '9414523',
      stationName: 'Redwood City (SF Bay)',
      datum: 'NAVD88',
      timestamp: Date.now(),
      source: 'NOAA MHHW Datum Baseline',
      isLive: false,
      provenance: 'PUBLISHED BASELINE'
    };

    this.rhnaBaseline = {
      targetUnits: 11135,
      baselineUnits: 37800,
      baselinePopulation: 81500,
      currentProgressUnits: 0,
      percentMet: 0.0
    };

    this._loadCachedTelemetry();
  }

  _loadCachedTelemetry() {
    try {
      const weatherCached = localStorage.getItem('bevelez_mv_weather_cache');
      if (weatherCached) {
        const parsed = JSON.parse(weatherCached);
        if (parsed && typeof parsed.tempC === 'number') {
          this.weatherData = {
            ...parsed,
            isLive: false,
            provenance: 'CACHED'
          };
        }
      }
      const tideCached = localStorage.getItem('bevelez_mv_tide_cache');
      if (tideCached) {
        const parsed = JSON.parse(tideCached);
        if (parsed && typeof parsed.waterLevelM === 'number') {
          this.tideData = {
            ...parsed,
            isLive: false,
            provenance: 'CACHED'
          };
        }
      }
    } catch (e) {
      console.warn('Telemetry cache notice:', e);
    }
  }

  async fetchWeather() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.3861&longitude=-122.0839&current=temperature_2m,relative_humidity_2m,direct_normal_irradiance,global_tilted_irradiance,wind_speed_10m,wind_direction_10m';
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const curr = data.current || {};
        const tempC = typeof curr.temperature_2m === 'number' ? curr.temperature_2m : 21.5;
        const tempF = +(tempC * 9 / 5 + 32).toFixed(1);
        const humidity = typeof curr.relative_humidity_2m === 'number' ? curr.relative_humidity_2m : 45;
        const solarDni = typeof curr.direct_normal_irradiance === 'number' ? curr.direct_normal_irradiance : 780.0;
        const solarGhi = typeof curr.global_tilted_irradiance === 'number' ? curr.global_tilted_irradiance : 650.0;
        const windKph = typeof curr.wind_speed_10m === 'number' ? curr.wind_speed_10m : 12.0;
        const windDir = typeof curr.wind_direction_10m === 'number' ? curr.wind_direction_10m : 310;

        const record = {
          tempC,
          tempF,
          humidity,
          solarDni,
          solarGhi,
          windKph,
          windDir,
          timestamp: Date.now(),
          source: 'Open-Meteo (37.3861°N, 122.0839°W)',
          isLive: true,
          provenance: 'LIVE API'
        };
        this.weatherData = record;
        try {
          localStorage.setItem('bevelez_mv_weather_cache', JSON.stringify(record));
        } catch (_) {}
        this._updateProvenanceUI();
        return record;
      }
    } catch (e) {
      console.warn('Open-Meteo runtime fetch fallback:', e);
    }
    return this.weatherData;
  }

  async fetchTides() {
    const url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=9414523&product=water_level&datum=NAVD&time_zone=lst_ldt&units=metric&application=bevelez_twin&format=json';
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 0 && data.data[0].v) {
          const v = parseFloat(data.data[0].v);
          const record = {
            waterLevelM: Number.isFinite(v) ? v : 1.72,
            stationId: '9414523',
            stationName: 'Redwood City (SF Bay)',
            datum: 'NAVD88',
            timestamp: Date.now(),
            source: 'NOAA CO-OPS Station 9414523',
            isLive: true,
            provenance: 'LIVE API'
          };
          this.tideData = record;
          try {
            localStorage.setItem('bevelez_mv_tide_cache', JSON.stringify(record));
          } catch (_) {}
          this._updateProvenanceUI();
          return record;
        }
      }
    } catch (e) {
      console.warn('NOAA Tide runtime fetch fallback:', e);
    }
    return this.tideData;
  }

  getRhnaBaseline() {
    const curSnap = this.latestSnapshot;
    const addedUnits = curSnap && typeof curSnap.rhnaDelta === 'number' ? Math.max(0, curSnap.rhnaDelta) : 0;
    const percentMet = +((addedUnits / 11135) * 100).toFixed(1);
    return {
      targetUnits: 11135,
      baselineUnits: 37800,
      baselinePopulation: 81500,
      currentProgressUnits: addedUnits,
      percentMet
    };
  }

  getCaltrainSchedule(stationId = 'mv_downtown') {
    const now = new Date();
    const curHour = now.getHours();
    const curMin = now.getMinutes();
    const isPeak = (curHour >= 6 && curHour < 10) || (curHour >= 15 && curHour < 19);
    const baseHeadway = isPeak ? 15 : 30;

    const curSnap = this.latestSnapshot;
    const effectiveHeadway = curSnap && typeof curSnap.caltrainHeadway === 'number'
      ? curSnap.caltrainHeadway
      : baseHeadway;

    const nextMins = [curMin + 4, curMin + effectiveHeadway + 4, curMin + effectiveHeadway * 2 + 4].map(m => {
      const h = (curHour + Math.floor(m / 60)) % 24;
      const min = m % 60;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    });

    const isDowntown = stationId !== 'san_antonio';
    return {
      stationId,
      stationName: isDowntown ? 'Mountain View Downtown Transit Center' : 'San Antonio Station',
      headwayMin: effectiveHeadway,
      nextHeadwayMin: effectiveHeadway,
      nextDepTimes: nextMins,
      source: 'Caltrain 2024 Electrified Timetable (BPR Model Mitigation)',
      isLive: false,
      provenance: 'PUBLISHED BASELINE'
    };
  }

  _updateProvenanceUI() {
    const weatherBadge = document.getElementById('prov-weather');
    if (weatherBadge) {
      const isLive = this.weatherData.isLive;
      const prov = this.weatherData.provenance;
      const dotCls = isLive ? 'live' : (prov === 'CACHED' ? 'cached' : 'baseline');
      weatherBadge.innerHTML = `<span class="prov-dot ${dotCls}">●</span> ${prov === 'LIVE API' ? 'LIVE OPEN-METEO' : (prov === 'CACHED' ? 'CACHED METEO' : 'METEO BASELINE')}`;
    }
    const tideBadge = document.getElementById('prov-tide');
    if (tideBadge) {
      const isLive = this.tideData.isLive;
      const prov = this.tideData.provenance;
      const dotCls = isLive ? 'live' : (prov === 'CACHED' ? 'cached' : 'baseline');
      tideBadge.innerHTML = `<span class="prov-dot ${dotCls}">●</span> ${prov === 'LIVE API' ? 'LIVE NOAA 9414523' : (prov === 'CACHED' ? 'CACHED NOAA' : 'NOAA BASELINE')}`;
    }
  }

  initLiveFeeds(simEngines, onUpdate) {
    this._simEngines = simEngines;
    this._onUpdate = onUpdate;
    this.fetchWeather().then(() => {
      if (this._onUpdate) this._onUpdate('weather-live');
    });
    this.fetchTides().then(() => {
      if (this._onUpdate) this._onUpdate('tides-live');
    });
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      this.fetchWeather();
      this.fetchTides();
    }, 300000);
  }

  subscribe(fn) {
    this.subscribers.push(fn);
  }

  publish(snapshot, reason = 'tick') {
    this.tickCount++;
    const record = {
      ...snapshot,
      weather: this.weatherData,
      tide: this.tideData,
      timestamp: Date.now(),
      tick: this.tickCount,
      reason
    };
    this.latestSnapshot = record;
    this.history.push(record);
    if (this.history.length > 120) {
      this.history.shift();
    }
    for (const sub of this.subscribers) {
      sub(record);
    }
  }

  getSnapshot() {
    return this.latestSnapshot;
  }
}

// ============================================================================
// 4. LAYER 5: INTELLIGENCE & ORCHESTRATION (GEMINI 4 ARGON + AGENTS + MCP)
// ============================================================================
class GeminiUrbanBridge {
  constructor(simEngines, onStateMutated, getParcels = () => []) {
    this.simEngines = simEngines;
    this.onStateMutated = onStateMutated;
    this.getParcels = getParcels;
    this.lastMcpDispatch = null;
  }

  async executePrompt(rawPrompt) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) return null;

    const lower = prompt.toLowerCase();
    const sim = this.simEngines;

    if (lower === 'reset' || lower.includes('restore baseline') || lower.includes('2026 baseline')) {
      sim.activeScenarioId = 'baseline';
      sim.params = {
        farCap: SCENARIO_PRESETS.baseline.farCap,
        transitShare: SCENARIO_PRESETS.baseline.transitShare,
        canopyMandate: SCENARIO_PRESETS.baseline.canopyMandate,
        baySurge: SCENARIO_PRESETS.baseline.baySurge
      };
      sim.districtMultipliers = { ...SCENARIO_PRESETS.baseline.districtMultipliers };
      sim.parcelOverrides.clear();
      const snapReset = this.onStateMutated('gemini-reset');
      this.lastMcpDispatch = {
        orchestrator: 'Gemini 4 Argon + MCP',
        toolsCalled: ['reset_postgis_baseline'],
        timestamp: Date.now()
      };
      return `[LOCAL NL-TO-GIS COMPILER] Restored 2026 Baseline: Population ${snapReset.population.toLocaleString()}, Greenspace ${snapReset.greenspacePct.toFixed(1)}%, US-101 LOS ${snapReset.corridors.us101.label}.`;
    }

    sim.activeScenarioId = 'custom';
    const mcpToolsCalled = [];

    const isAdditive = /\b(also|additionally|keep|plus)\b/.test(lower);
    if (!isAdditive) {
      sim.districtMultipliers = { ...SCENARIO_PRESETS.baseline.districtMultipliers };
    }

    const isDownzone = /\b(downzone|low-density|low density|single-family|single family|r-1|r1|gentle density)\b/.test(lower);
    const targetMult = isDownzone ? 0.62 : 2.45;

    const matchedDistricts = [];
    if (lower.includes('bayshore') || lower.includes('google') || lower.includes('shoreline')) {
      sim.districtMultipliers.NB_PP = targetMult;
      matchedDistricts.push('NB_PP');
    }
    if (lower.includes('el camino') || lower.includes('ecr') || lower.includes('boulevard') || lower.includes('brt')) {
      sim.districtMultipliers.ECR_MU = targetMult;
      matchedDistricts.push('ECR_MU');
    }
    if (lower.includes('castro') || lower.includes('downtown') || lower.includes('caltrain') || lower.includes('tod')) {
      sim.districtMultipliers.DT_CRA = isDownzone ? 0.68 : 2.35;
      matchedDistricts.push('DT_CRA');
    }
    if (lower.includes('whisman') || lower.includes('moffett') || lower.includes('hangar')) {
      sim.districtMultipliers.EW_TOD = isDownzone ? 0.68 : 2.3;
      matchedDistricts.push('EW_TOD');
    }
    if (lower.includes('waverly') || lower.includes('old mountain view') || lower.includes('residential')) {
      sim.districtMultipliers.RES_SF = isDownzone ? 0.72 : 1.75;
      matchedDistricts.push('RES_SF');
    }
    if (matchedDistricts.length > 0) {
      mcpToolsCalled.push('rezone_postgis_district');
    }

    const storyMatch = lower.match(/(\d+)\s*(?:stories|story|floors)/);
    const farMatch = lower.match(/far\s*(?:of|to|cap)?\s*(\d+(?:\.\d+)?)/);
    if (farMatch) {
      sim.params.farCap = Math.max(1.0, Math.min(6.0, parseFloat(farMatch[1])));
      mcpToolsCalled.push('set_far_envelope');
    } else if (storyMatch) {
      const stories = parseInt(storyMatch[1], 10);
      sim.params.farCap = Math.max(1.0, Math.min(6.0, +(stories * 0.65).toFixed(1)));
      mcpToolsCalled.push('set_far_envelope');
    } else if (isDownzone) {
      sim.params.farCap = 1.4;
      mcpToolsCalled.push('set_far_envelope');
    } else if (matchedDistricts.length > 0 || lower.includes('upzone') || lower.includes('high density')) {
      sim.params.farCap = 4.4;
      mcpToolsCalled.push('set_far_envelope');
    }

    const transitPctMatch =
      lower.match(/(\d+)\s*%\s*(?:transit|rail|mode|brt|shuttle|caltrain)/) ||
      lower.match(/(?:transit|rail|mode\s*share|brt)\s*(?:to|at|of)?\s*(\d+)\s*%/);
    if (transitPctMatch) {
      sim.params.transitShare = Math.max(10, Math.min(85, parseInt(transitPctMatch[1], 10)));
      mcpToolsCalled.push('configure_gtfs_realtime_transit');
    } else if (lower.includes('brt') || lower.includes('caltrain') || lower.includes('tod') || lower.includes('transit')) {
      sim.params.transitShare = isDownzone ? 25 : Math.max(sim.params.transitShare, 54);
      mcpToolsCalled.push('configure_gtfs_realtime_transit');
    }

    const greenPctMatch =
      lower.match(/(\d+)\s*%\s*(?:solar|canopy|green|greenspace|tree|trees|permeable)/) ||
      lower.match(/(?:solar|canopy|green|greenspace|tree)\s*(?:to|at|of|by)?\s*\+?(\d+)\s*%/);
    if (greenPctMatch) {
      sim.params.canopyMandate = Math.max(10, Math.min(55, parseInt(greenPctMatch[1], 10)));
      mcpToolsCalled.push('evaluate_webgpu_solar_canopy');
    } else if (lower.includes('solar') || lower.includes('canopy') || lower.includes('green') || lower.includes('tree') || lower.includes('sponge')) {
      sim.params.canopyMandate = Math.min(52, Math.max(32, sim.params.canopyMandate + 12));
      mcpToolsCalled.push('evaluate_webgpu_solar_canopy');
    }

    if (/\b(eco-park|ecopark|eco-parks|park|parks|bioswale|bioswales|open space)\b/.test(lower)) {
      const parcels = this.getParcels();
      const countMatch = lower.match(/(\d+)\s+(?:[\w-]+\s+){0,3}(?:parcels|blocks|lots|parks|eco-parks)/);
      const targetCount = countMatch ? Math.min(24, Math.max(1, parseInt(countMatch[1], 10))) : 6;
      const candidateParcels = parcels.filter((p) =>
        matchedDistricts.length > 0 ? matchedDistricts.includes(p.district) : p.district === 'DT_CRA' || p.district === 'NB_PP'
      );
      for (let i = 0; i < Math.min(targetCount, candidateParcels.length); i++) {
        sim.parcelOverrides.set(candidateParcels[i].id, 'PARK');
      }
      mcpToolsCalled.push('convert_parcels_to_ecopark');
    }

    if (lower.includes('no flood') || lower.includes('no surge') || lower.includes('0m surge') || lower.includes('dry')) {
      sim.params.baySurge = 0.0;
      mcpToolsCalled.push('simulate_bay_surge_slr');
    } else if (lower.includes('flood') || lower.includes('surge') || lower.includes('tide') || lower.includes('sea')) {
      const meterMatch = lower.match(/(\d+(?:\.\d+)?)\s*m/);
      sim.params.baySurge = meterMatch
        ? Math.max(0.0, Math.min(2.0, parseFloat(meterMatch[1])))
        : 1.3;
      mcpToolsCalled.push('simulate_bay_surge_slr');
    }

    const snap = this.onStateMutated('gemini-prompt');
    this.lastMcpDispatch = {
      orchestrator: 'Gemini 4 Argon + MCP',
      prompt,
      matchedDistricts,
      toolsCalled: mcpToolsCalled.length ? mcpToolsCalled : ['evaluate_sumo_bpr_network'],
      timestamp: Date.now()
    };

    const localSynthesis = `[LOCAL NL-TO-GIS COMPILER] Executed "${prompt}": Projected Population ${snap.population.toLocaleString()} (${snap.rhnaDelta >= 0 ? '+' : ''}${snap.rhnaDelta.toLocaleString()} RHNA units), Greenspace ${snap.greenspacePct.toFixed(1)}%, US-101 LOS ${snap.corridors.us101.label} (V/C ${snap.corridors.us101.vc}), UHI ${snap.uhiDelta >= 0 ? '+' : ''}${snap.uhiDelta}°C.`;

    const savedKey = localStorage.getItem('bevelez_gemini_api_key');
    if (savedKey && savedKey.startsWith('AIza')) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(savedKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are the Mountain View CA Urban Planning Digital Twin AI. Summarize this scenario in 1 concise sentence (max 28 words) citing metrics: Prompt="${prompt}", Pop=${snap.population}, Units=${snap.housingUnits}, Greenspace=${snap.greenspacePct}%, 101_LOS=${snap.corridors.us101.label}.`
                    }
                  ]
                }
              ]
            })
          }
        );
        if (res.ok) {
          const data = await res.json();
          const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (aiText) return aiText;
        }
      } catch {
        // Fall back cleanly to deterministic synthesis
      }
    }

    return localSynthesis;
  }
}

// ============================================================================
// 5. LAYER 1: 3D SPATIAL VIEWPORT (MOUNTAIN VIEW ARCHITECTURAL LIGHT-TABLE)
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
scene.fog = new THREE.FogExp2(0x0a0d12, 0.0014);

const camera = new THREE.PerspectiveCamera(
  29,
  window.innerWidth / window.innerHeight,
  1.0,
  750
);
// Exact 1:1 Full-City Mountain View Isometric Orbital Angle & Framing
camera.position.set(-126.0, 138.0, 136.0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Post-Processing Composer with architectural bloom for HDR transit corridors
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.26,
  0.32,
  0.88
);
composer.addPass(bloomPass);

// PBR Studio Environment & Crisp Architectural Maquette Lighting
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
scene.environmentIntensity = 0.36;
roomEnv.dispose();
pmremGenerator.dispose();

const ambientLight = new THREE.AmbientLight(0x98b0c8, 0.42);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff6e8, 2.05);
keyLight.position.set(-92, 118, 52);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near = 25;
keyLight.shadow.camera.far = 320;
const d = 98;
keyLight.shadow.camera.left = -d;
keyLight.shadow.camera.right = d;
keyLight.shadow.camera.top = d;
keyLight.shadow.camera.bottom = -d;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x58c4f0, 0.58);
rimLight.position.set(95, 58, -90);
scene.add(rimLight);

// OrbitControls with smooth damping centered on Full-City Mountain View
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.0, -4.0, 2.0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.12;
controls.minDistance = 32;
controls.maxDistance = 285;
controls.update();

const cityRoot = new THREE.Group();
scene.add(cityRoot);

// ============================================================================
// 5A. ARCHITECTURAL LIGHT-TABLE PLINTH, SF BAY WETLANDS & STEVENS CREEK
// ============================================================================
const TABLE_W = 136;

// Dark Studio Pedestal Floor underneath the table to catch physical drop shadows
const studioFloorGeo = new THREE.PlaneGeometry(420, 420);
studioFloorGeo.rotateX(-Math.PI / 2);
const studioFloorMat = new THREE.MeshStandardMaterial({
  color: 0x080b10,
  roughness: 0.85,
  metalness: 0.15
});
const studioFloorMesh = new THREE.Mesh(studioFloorGeo, studioFloorMat);
studioFloorMesh.position.y = -3.85;
studioFloorMesh.receiveShadow = true;
cityRoot.add(studioFloorMesh);

// Dark Obsidian Beveled Architectural Plinth Base
const plinthGeo = new THREE.BoxGeometry(TABLE_W + 2.2, 3.6, TABLE_W + 2.2);
const plinthMat = new THREE.MeshStandardMaterial({
  color: 0x0b0f15,
  roughness: 0.58,
  metalness: 0.34
});
const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
plinthMesh.position.y = -2.0;
plinthMesh.castShadow = true;
plinthMesh.receiveShadow = true;
cityRoot.add(plinthMesh);

// Subtle Metallic-Bronze Perimeter Hairline Frame around the 360° Table
const frameEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(TABLE_W + 2.3, 3.62, TABLE_W + 2.3));
const frameEdgeMat = new THREE.LineBasicMaterial({
  color: 0x8c7a5b,
  transparent: true,
  opacity: 0.42
});
const frameEdgeLines = new THREE.LineSegments(frameEdgeGeo, frameEdgeMat);
frameEdgeLines.position.y = -2.0;
cityRoot.add(frameEdgeLines);

// Shared 3D Curves for Stevens Creek Riparian Corridor & Braided Emerald Trails (True geoToScene Coordinates)
const stevensCreekCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(15.9, 0, 40.8),
  new THREE.Vector3(12.3, 0, 33.1),
  new THREE.Vector3(12.4, 0, 22.5),
  new THREE.Vector3(11.7, 0, 14.9),
  new THREE.Vector3(11.8, 0, 9.8),
  new THREE.Vector3(11.5, 0, -1.2),
  new THREE.Vector3(11.6, 0, -13.2),
  new THREE.Vector3(11.8, 0, -28.0),
  new THREE.Vector3(12.2, 0, -45.0)
]);

const stevensCreekBraidedCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(16.6, 0, 40.2),
  new THREE.Vector3(13.1, 0, 32.8),
  new THREE.Vector3(13.2, 0, 22.2),
  new THREE.Vector3(12.5, 0, 14.6),
  new THREE.Vector3(12.6, 0, 9.5),
  new THREE.Vector3(12.3, 0, -1.5),
  new THREE.Vector3(12.4, 0, -13.5),
  new THREE.Vector3(12.6, 0, -28.2),
  new THREE.Vector3(13.0, 0, -45.0)
]);

// Interpolate US-101 Z coordinate at any X in true geoToScene coordinates
const US101_PROFILE = [
  [-46.6, -66.4],
  [-27.6, -43.7],
  [-18.9, -33.4],
  [-4.25, -19.9],
  [1.28, -16.4],
  [6.4, -13.8],
  [12.6, -10.85],
  [26.5, -7.0],
  [44.9, -1.6],
  [58.0, 2.2]
];

function getUs101ZAtX(x) {
  if (x <= US101_PROFILE[0][0]) return US101_PROFILE[0][1];
  for (let i = 0; i < US101_PROFILE.length - 1; i++) {
    const [x0, z0] = US101_PROFILE[i];
    const [x1, z1] = US101_PROFILE[i + 1];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return z0 + t * (z1 - z0);
    }
  }
  return US101_PROFILE[US101_PROFILE.length - 1][1];
}

// Smooth World-Coordinate Coastline Curve for Northern SF Bay Wetlands & Charleston Slough
const coastlineWorldPts = [
  new THREE.Vector3(-68.0, 0, -48.0),
  new THREE.Vector3(-52.0, 0, -46.5),
  new THREE.Vector3(-36.0, 0, -45.5),
  new THREE.Vector3(-22.0, 0, -45.0),
  new THREE.Vector3(-14.5, 0, -43.5),
  new THREE.Vector3(-9.5, 0, -46.5),
  new THREE.Vector3(-4.5, 0, -42.0),
  new THREE.Vector3(1.5, 0, -46.2),
  new THREE.Vector3(9.5, 0, -45.5),
  new THREE.Vector3(16.5, 0, -42.5),
  new THREE.Vector3(24.5, 0, -39.5),
  new THREE.Vector3(34.5, 0, -38.0),
  new THREE.Vector3(46.0, 0, -36.5),
  new THREE.Vector3(58.0, 0, -35.5),
  new THREE.Vector3(68.0, 0, -34.5)
];
const coastlineCurve = new THREE.CatmullRomCurve3(coastlineWorldPts, false, 'centripetal', 0.35);

// Organic Tidal Marshland Peninsulas & Islands along Northern SF Bay Shoreline
const MARSH_ISLANDS_WORLD = [
  [
    [-45.0, -66.5], [-18.0, -66.5], [-14.0, -54.0], [-22.0, -49.5],
    [-34.0, -51.0], [-44.0, -56.0]
  ],
  [
    [-4.0, -64.0], [18.0, -65.0], [22.0, -53.0], [12.0, -49.0],
    [-2.0, -51.0], [-7.0, -57.0]
  ],
  [
    [30.0, -66.0], [64.0, -66.0], [64.0, -44.0], [48.0, -42.0],
    [34.0, -45.0], [28.0, -54.0]
  ]
];

// Procedural Topographic Land, Street Grid & SF Bay Wetlands Canvas Texture (2048x2048)
function createTableSurfaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  const toCanvasXY = (wx, wz) => [
    ((wx / TABLE_W) + 0.5) * 2048,
    ((wz / TABLE_W) + 0.5) * 2048
  ];

  // 1. Deep matte obsidian-charcoal asphalt land base
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, 2048, 2048);

  // Subtle urban block platters & street network South of SF Bay Coastline
  const stepPx = (3.95 / TABLE_W) * 2048;
  for (let gx = -64.0; gx <= 64.0; gx += 3.95) {
    for (let gz = -38.0; gz <= 64.0; gz += 3.95) {
      if (gz < getUs101ZAtX(gx) - 18.0) continue;
      const [bx, by] = toCanvasXY(gx, gz);
      ctx.fillStyle = '#11161f';
      ctx.strokeStyle = 'rgba(218, 224, 234, 0.065)';
      ctx.lineWidth = 1.2;
      ctx.fillRect(bx - stepPx * 0.42, by - stepPx * 0.42, stepPx * 0.84, stepPx * 0.84);
      ctx.strokeRect(bx - stepPx * 0.42, by - stepPx * 0.42, stepPx * 0.84, stepPx * 0.84);
    }
  }

  // Subtle secondary street grid lines across entire land table
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.038)';
  ctx.lineWidth = 2.0;
  for (let i = 0; i < 2048; i += stepPx) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 2048);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(2048, i);
    ctx.stroke();
  }

  // Official City of Mountain View Municipal Boundary Outline (from OSM relation 1544956)
  if (mvGisData && Array.isArray(mvGisData.city_boundary) && mvGisData.city_boundary.length > 3) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232, 192, 118, 0.34)';
    ctx.lineWidth = 3.0;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    mvGisData.city_boundary.forEach(([lon, lat], idx) => {
      const sc = geoToScene(lon, lat);
      const [px, py] = toCanvasXY(sc.x, sc.z);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Curved North Bayshore campus ring road framing Google Bay View & Shoreline Amphitheatre
  ctx.strokeStyle = 'rgba(222, 190, 134, 0.48)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  const loopPts = [
    [-8.5, -39.5], [1.5, -42.5], [11.5, -39.5], [12.5, -28.0],
    [6.5, -22.5], [-4.5, -23.5], [-9.5, -31.0], [-8.5, -39.5]
  ];
  const loopCurve = new THREE.CatmullRomCurve3(loopPts.map(([lx, lz]) => new THREE.Vector3(lx, 0, lz)), true);
  loopCurve.getPoints(90).forEach((pt, idx) => {
    const [px, py] = toCanvasXY(pt.x, pt.z);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Shoreline Lake retention basin just west of Shoreline Amphitheatre
  ctx.fillStyle = '#0f2b2e';
  ctx.strokeStyle = 'rgba(218, 184, 122, 0.52)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const [pondX, pondY] = toCanvasXY(-5.5, -40.5);
  ctx.ellipse(pondX, pondY, 42, 26, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 2. Northern San Francisco Bay Wetlands & Charleston Slough Lagoon (z < -36)
  const coastSamples = coastlineCurve.getPoints(180);
  ctx.save();
  ctx.beginPath();
  const [cStartX, cStartY] = toCanvasXY(coastSamples[0].x, coastSamples[0].z);
  ctx.moveTo(cStartX, cStartY);
  for (let i = 1; i < coastSamples.length; i++) {
    const [cx, cy] = toCanvasXY(coastSamples[i].x, coastSamples[i].z);
    ctx.lineTo(cx, cy);
  }
  ctx.lineTo(2048, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();

  const [gradCx, gradCy] = toCanvasXY(4.0, -56.0);
  const waterGrad = ctx.createRadialGradient(gradCx, gradCy, 40, gradCx, gradCy, 1100);
  waterGrad.addColorStop(0, '#54b4a6');
  waterGrad.addColorStop(0.32, '#34867d');
  waterGrad.addColorStop(0.66, '#1b5452');
  waterGrad.addColorStop(1, '#0d292d');
  ctx.fillStyle = waterGrad;
  ctx.fill();

  // Fine stippled bathymetric wave matrix inside Northern SF Bay Wetlands
  ctx.clip();
  for (let x = 0; x < 2048; x += 8) {
    for (let y = 0; y < 560; y += 8) {
      const dist = Math.hypot(x - gradCx, y - gradCy);
      const wave = Math.sin(x * 0.036 + y * 0.022) * Math.cos(y * 0.032 - x * 0.014) * 0.14;
      const alpha = Math.max(0.04, Math.min(0.52, 0.44 - dist / 1850 + wave));
      ctx.fillStyle = `rgba(124, 242, 214, ${alpha})`;
      ctx.fillRect(x, y, 2.4, 2.4);
    }
  }
  ctx.restore();

  // Smooth Organic Marshland Peninsulas & Islands inside SF Bay
  MARSH_ISLANDS_WORLD.forEach((pts) => {
    const islandCurve = new THREE.CatmullRomCurve3(
      pts.map(([ix, iz]) => new THREE.Vector3(ix, 0, iz)),
      true,
      'centripetal',
      0.4
    );
    const sampled = islandCurve.getPoints(96);
    ctx.fillStyle = '#0d1218';
    ctx.strokeStyle = 'rgba(186, 164, 112, 0.56)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    sampled.forEach((pt, idx) => {
      const [px, py] = toCanvasXY(pt.x, pt.z);
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // Golden Shoreline contour border hugging the entire Northern Bayfront edge
  ctx.strokeStyle = 'rgba(222, 182, 112, 0.76)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  coastSamples.forEach((pt, idx) => {
    const [cx, cy] = toCanvasXY(pt.x, pt.z);
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();

  // 3. Stevens Creek Riparian Corridor Ravine & Dual Braided Emerald Paths
  ctx.save();
  ctx.strokeStyle = '#06120b';
  ctx.lineWidth = 36;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const pt = stevensCreekCurve.getPointAt(i / 90);
    const [px, py] = toCanvasXY(pt.x, pt.z);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Subtle emerald creek bank glow on canvas
  [stevensCreekCurve, stevensCreekBraidedCurve].forEach((crv, idx) => {
    ctx.strokeStyle = idx === 0 ? 'rgba(64, 244, 152, 0.85)' : 'rgba(64, 244, 152, 0.58)';
    ctx.lineWidth = idx === 0 ? 3.2 : 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const pt = crv.getPointAt(i / 90);
      const [px, py] = toCanvasXY(pt.x, pt.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
  ctx.restore();

  // 4. Moffett Federal Airfield Tarmac, Parallel Runways 32L/32R & NASA Ames Apron at (32.5, -22.5)
  ctx.save();
  const [hx, hy] = toCanvasXY(32.5, -22.5);
  ctx.translate(hx, hy);
  ctx.rotate(-0.52);
  ctx.fillStyle = '#090c11';
  ctx.fillRect(-130, -210, 260, 420);
  ctx.strokeStyle = 'rgba(210, 178, 118, 0.38)';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(-130, -210, 260, 420);

  // Twin parallel runways & taxiways
  ctx.strokeStyle = 'rgba(180, 190, 205, 0.22)';
  ctx.lineWidth = 2.4;
  [-45, 45].forEach((tx) => {
    ctx.beginPath();
    ctx.moveTo(tx, -195);
    ctx.lineTo(tx, 195);
    ctx.stroke();
  });
  [-120, 0, 120].forEach((ty) => {
    ctx.beginPath();
    ctx.moveTo(-115, ty);
    ctx.lineTo(115, ty);
    ctx.stroke();
  });
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const surfaceGeo = new THREE.PlaneGeometry(TABLE_W, TABLE_W);
surfaceGeo.rotateX(-Math.PI / 2);
const surfaceMat = new THREE.MeshStandardMaterial({
  map: createTableSurfaceTexture(),
  roughness: 0.78,
  metalness: 0.14
});
const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
surfaceMesh.position.y = -0.18;
surfaceMesh.receiveShadow = true;
cityRoot.add(surfaceMesh);

// 3D Low-Relief Marshland Peninsulas inside SF Bay Wetlands for authentic maquette depth
function buildMarshlandReliefPads() {
  const marshMat = new THREE.MeshStandardMaterial({
    color: 0x0e1319,
    roughness: 0.82,
    metalness: 0.1
  });
  const rimMat = new THREE.LineBasicMaterial({
    color: 0x9c885e,
    transparent: true,
    opacity: 0.52
  });

  MARSH_ISLANDS_WORLD.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(
      pts.map(([ix, iz]) => new THREE.Vector3(ix, 0, iz)),
      true,
      'centripetal',
      0.4
    );
    const sampled = curve.getPoints(72);
    const shape = new THREE.Shape();
    sampled.forEach((pt, idx) => {
      if (idx === 0) shape.moveTo(pt.x, -pt.z);
      else shape.lineTo(pt.x, -pt.z);
    });
    const extGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    extGeo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(extGeo, marshMat);
    mesh.position.y = -0.17;
    mesh.receiveShadow = true;
    cityRoot.add(mesh);

    const linePts = sampled.map((p) => new THREE.Vector3(p.x, -0.08, p.z));
    linePts.push(linePts[0].clone());
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
    cityRoot.add(new THREE.Line(lineGeo, rimMat));
  });
}
buildMarshlandReliefPads();

// Dynamic SF Bay Storm Surge / Sea-Level Rise Plane (Layer 4 Coastal Flood Overlay covering North Bayshore & SF Bay Lowlands)
const surgeWaterGeo = new THREE.PlaneGeometry(TABLE_W - 1, 56, 48, 24);
surgeWaterGeo.rotateX(-Math.PI / 2);
const surgeWaterMat = new THREE.MeshStandardMaterial({
  color: 0x168ea6,
  emissive: 0x073440,
  emissiveIntensity: 0.32,
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
  roughness: 0.55,
  metalness: 0.08
});
const surgeWaterMesh = new THREE.Mesh(surgeWaterGeo, surgeWaterMat);
surgeWaterMesh.position.set(0, -0.14, -39.5);
surgeWaterMesh.renderOrder = 1;
surgeWaterMesh.visible = false;
cityRoot.add(surgeWaterMesh);

// ============================================================================
// 5B. LUMINOUS TRANSIT & ARTERIAL CORRIDORS (TRUE GEOTOSCENE ALIGNMENT)
// ============================================================================
const corridorsGroup = new THREE.Group();
cityRoot.add(corridorsGroup);

function buildGlowingCorridor(points, width, colorHex, yOffset = 0.03, opacity = 0.94, hdrMultiplier = 1.0, renderOrder = 3) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 108, width * 0.5, 6, false);
  tubeGeo.scale(1, 0.014, 1);
  const col = new THREE.Color(colorHex).multiplyScalar(hdrMultiplier);
  const mat = new THREE.MeshBasicMaterial({
    color: col,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(tubeGeo, mat);
  mesh.position.y = yOffset;
  mesh.renderOrder = renderOrder;
  corridorsGroup.add(mesh);
  return { curve, mesh, mat, width };
}

// 1. Caltrain Electrified Corridor (True geoToScene NW-to-SE multi-track cyan laser rails through San Antonio & Downtown MV)
const caltrainPoints = [
  new THREE.Vector3(-58.0, 0, -32.7),
  new THREE.Vector3(-46.7, 0, -23.8),
  new THREE.Vector3(-35.4, 0, -14.9),
  new THREE.Vector3(-26.6, 0, -8.0),
  new THREE.Vector3(-14.6, 0, -1.9),
  new THREE.Vector3(2.05, 0, 6.38),
  new THREE.Vector3(13.9, 0, 12.4),
  new THREE.Vector3(29.7, 0, 19.3),
  new THREE.Vector3(48.5, 0, 27.2)
];
buildGlowingCorridor(caltrainPoints, 3.8, 0x0e6c8a, 0.018, 0.20, 1.08, 2);
const caltrainMain = buildGlowingCorridor(caltrainPoints, 1.9, 0x1ca8cc, 0.025, 0.42, 1.25, 2);
[-0.55, 0.0, 0.55].forEach((offset, idx) => {
  buildGlowingCorridor(
    caltrainPoints.map((p) => new THREE.Vector3(p.x + offset * 0.45, 0, p.z - offset * 0.85)),
    idx === 1 ? 0.20 : 0.30,
    idx === 1 ? 0x6ceeff : 0xb4feff,
    0.068,
    idx === 1 ? 0.82 : 0.98,
    1.78,
    4
  );
});

// 2. US-101 Bayshore Freeway (True geoToScene Sweeping HDR Cyan Multi-Lane Corridor separating North Bayshore from Central MV)
const us101Points = [
  new THREE.Vector3(-46.6, 0, -66.4),
  new THREE.Vector3(-27.6, 0, -43.7),
  new THREE.Vector3(-18.9, 0, -33.4),
  new THREE.Vector3(-4.25, 0, -19.9),
  new THREE.Vector3(1.28, 0, -16.4),
  new THREE.Vector3(6.4, 0, -13.8),
  new THREE.Vector3(12.6, 0, -10.85),
  new THREE.Vector3(26.5, 0, -7.0),
  new THREE.Vector3(44.9, 0, -1.6),
  new THREE.Vector3(58.0, 0, 2.2)
];
buildGlowingCorridor(us101Points, 4.4, 0x1284a8, 0.02, 0.22, 1.12, 2);
buildGlowingCorridor(us101Points, 2.2, 0x28bce0, 0.028, 0.44, 1.3, 3);
const us101Main = buildGlowingCorridor(us101Points, 0.88, 0xc4ffff, 0.072, 0.98, 1.82, 4);

// Parallel US-101 outer freeway lanes for authentic multi-lane light-trail separation
[-0.75, 0.75].forEach((shift) => {
  const shiftedPts = us101Points.map((p) => new THREE.Vector3(p.x + shift * 0.55, 0, p.z - shift * 0.65));
  buildGlowingCorridor(shiftedPts, 0.24, 0x8ef8ff, 0.066, 0.88, 1.55, 4);
});

// 3. El Camino Real / SR-82 Grand Boulevard Spine (True geoToScene warm amber corridor from San Antonio to Sunnyvale border)
const ecrPoints = [
  new THREE.Vector3(-52.0, 0, -16.8),
  new THREE.Vector3(-43.5, 0, -9.2),
  new THREE.Vector3(-34.3, 0, -0.5),
  new THREE.Vector3(-24.7, 0, 5.1),
  new THREE.Vector3(-16.3, 0, 11.1),
  new THREE.Vector3(-7.3, 0, 17.3),
  new THREE.Vector3(2.0, 0, 23.2),
  new THREE.Vector3(11.9, 0, 29.1),
  new THREE.Vector3(29.1, 0, 36.9),
  new THREE.Vector3(48.5, 0, 43.2)
];
buildGlowingCorridor(ecrPoints, 3.4, 0xb8580a, 0.018, 0.16, 1.08, 2);
buildGlowingCorridor(ecrPoints, 1.65, 0xe0821c, 0.024, 0.36, 1.24, 3);
const ecrMain = buildGlowingCorridor(ecrPoints, 0.60, 0xffe092, 0.064, 0.94, 1.65, 4);

// Extra-intense El Camino & Castro Promenade Aura along the central spine
const ecrPromenadePoints = [
  new THREE.Vector3(-34.3, 0, -0.5),
  new THREE.Vector3(-24.7, 0, 5.1),
  new THREE.Vector3(-16.3, 0, 11.1),
  new THREE.Vector3(-7.3, 0, 17.3),
  new THREE.Vector3(2.0, 0, 23.2),
  new THREE.Vector3(11.9, 0, 29.1)
];
buildGlowingCorridor(ecrPromenadePoints, 3.8, 0xc8640c, 0.019, 0.18, 1.12, 2);
buildGlowingCorridor(ecrPromenadePoints, 1.9, 0xe88a20, 0.026, 0.42, 1.32, 3);
buildGlowingCorridor(ecrPromenadePoints, 0.72, 0xffe69c, 0.068, 0.98, 1.78, 4);

// 4. Downtown Castro Street / Miramonte Ave / Moffett Blvd Cross-Arterial (True geoToScene Alignment)
const castroPoints = [
  new THREE.Vector3(-7.7, 0, 35.9),
  new THREE.Vector3(-7.5, 0, 24.4),
  new THREE.Vector3(-2.7, 0, 18.9),
  new THREE.Vector3(0.6, 0, 13.2),
  new THREE.Vector3(3.8, 0, 7.2),
  new THREE.Vector3(11.5, 0, -6.5),
  new THREE.Vector3(19.5, 0, -18.5)
];
buildGlowingCorridor(castroPoints, 2.2, 0xc06410, 0.019, 0.18, 1.1, 2);
const castroMain = buildGlowingCorridor(castroPoints, 0.52, 0xf8d688, 0.06, 0.90, 1.48, 3);

// Intense Warm Amber-Gold Downtown Castro St. Pedestrian Promenade Core
const castroDowntownPoints = [
  new THREE.Vector3(-7.5, 0, 24.4),
  new THREE.Vector3(-2.7, 0, 18.9),
  new THREE.Vector3(0.6, 0, 13.2),
  new THREE.Vector3(3.8, 0, 7.2)
];
buildGlowingCorridor(castroDowntownPoints, 3.6, 0xc86810, 0.02, 0.22, 1.14, 2);
buildGlowingCorridor(castroDowntownPoints, 1.85, 0xe88c24, 0.027, 0.46, 1.35, 3);
buildGlowingCorridor(castroDowntownPoints, 0.74, 0xffe498, 0.069, 0.98, 1.82, 4);

// 5. Shoreline Boulevard Overpass Connector from El Camino across Caltrain & US-101 to North Bayshore
const shorelinePoints = [
  new THREE.Vector3(-8.85, 0, 16.6),
  new THREE.Vector3(-6.0, 0, 11.15),
  new THREE.Vector3(-1.45, 0, 2.46),
  new THREE.Vector3(1.85, 0, -3.07),
  new THREE.Vector3(2.06, 0, -8.76),
  new THREE.Vector3(2.15, 0, -16.18),
  new THREE.Vector3(2.18, 0, -24.1),
  new THREE.Vector3(2.25, 0, -34.5)
];
const shorelineMain = buildGlowingCorridor(shorelinePoints, 0.42, 0xf2c874, 0.054, 0.85, 1.35, 3);

// 6. Dual Braided Emerald Stevens Creek Trail 3D Ribbons
buildGlowingCorridor(stevensCreekCurve.getPoints(72), 0.90, 0x0e6b3c, 0.012, 0.28, 1.1, 1);
buildGlowingCorridor(stevensCreekCurve.getPoints(72), 0.28, 0x42f89c, 0.018, 0.92, 1.52, 2);
buildGlowingCorridor(stevensCreekBraidedCurve.getPoints(64), 0.20, 0x62ffae, 0.018, 0.78, 1.38, 2);

// Warm architectural point lights over Downtown Castro & El Camino transit plaza
const castroPlazaLight = new THREE.PointLight(0xffb44c, 3.1, 38, 1.45);
castroPlazaLight.position.set(1.5, 4.2, 11.5);
cityRoot.add(castroPlazaLight);

const castroSouthLight = new THREE.PointLight(0xffaa38, 2.2, 30, 1.5);
castroSouthLight.position.set(-2.5, 3.5, 20.0);
cityRoot.add(castroSouthLight);

// Animated Micro-Vehicles & Caltrain EMU Trains
const trafficAgents = [];
const vehicleGeo = new THREE.BoxGeometry(0.34, 0.16, 0.98);
const cyanVehMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcffff).multiplyScalar(1.45) });
const amberVehMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd884).multiplyScalar(1.45) });

for (let i = 0; i < 48; i++) {
  const is101 = i < 28;
  const mesh = new THREE.Mesh(vehicleGeo, is101 ? cyanVehMat : amberVehMat);
  cityRoot.add(mesh);
  trafficAgents.push({
    mesh,
    curve: is101 ? us101Main.curve : ecrMain.curve,
    is101,
    t: (i / (is101 ? 28 : 20)) % 1,
    laneOffset: (i % 2 === 0 ? 1 : -1) * 0.44,
    dir: i % 2 === 0 ? 1 : -1,
    baseSpeed: is101 ? 0.055 : 0.038
  });
}

// 2 Bi-Directional Caltrain Electric Trains (Stadler KISS Consists)
const caltrainTrains = [];
const trainGeo = new THREE.BoxGeometry(0.56, 0.44, 5.8);
const trainMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa8faff).multiplyScalar(1.45) });
[-0.65, 0.65].forEach((laneShift, idx) => {
  const mesh = new THREE.Mesh(trainGeo, trainMat);
  cityRoot.add(mesh);
  caltrainTrains.push({
    mesh,
    laneShift,
    t: idx === 0 ? 0.68 : 0.28,
    dir: idx === 0 ? 1 : -1
  });
});

// Render Authentic Mountain View GIS Infrastructure (Additional Roads, VTA Light Rail, Stations, Trails, Water, Parks)
function renderGisInfrastructure() {
  if (!mvGisData) return;

  // Skip primary corridors already rendered with multi-layer HDR tubes above to avoid double-drawing
  const primaryHeroRoads = new Set(['US-101', 'El Camino Real (SR-82)', 'Shoreline Boulevard']);

  // Remaining Real Road Corridors (SR-85, SR-237, Central Expy, Miramonte, Rengstorff, San Antonio, Middlefield, Grant)
  if (Array.isArray(mvGisData.roads)) {
    const roadStyles = {
      'SR-85': { width: 1.5, color: 0x1ca2cc, y: 0.034, op: 0.68, hdr: 1.35 },
      'SR-237': { width: 1.5, color: 0x20a8d4, y: 0.034, op: 0.68, hdr: 1.35 },
      'Central Expressway': { width: 1.15, color: 0xee9224, y: 0.035, op: 0.58, hdr: 1.25 },
      'Miramonte Avenue': { width: 0.68, color: 0xecd088, y: 0.028, op: 0.46, hdr: 1.1 },
      'Rengstorff Avenue': { width: 0.68, color: 0xecd088, y: 0.028, op: 0.46, hdr: 1.1 },
      'San Antonio Road': { width: 0.85, color: 0xf0c878, y: 0.030, op: 0.54, hdr: 1.18 },
      'Middlefield Road': { width: 0.78, color: 0xedd28e, y: 0.029, op: 0.48, hdr: 1.12 },
      'Grant Road': { width: 0.72, color: 0xecd088, y: 0.028, op: 0.48, hdr: 1.12 }
    };

    mvGisData.roads.forEach((road) => {
      if (primaryHeroRoads.has(road.name)) return;
      if (!Array.isArray(road.coords) || road.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of road.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        const style = roadStyles[road.name] || { width: 0.65, color: 0xe6caa0, y: 0.028, op: 0.42, hdr: 1.1 };
        buildGlowingCorridor(pts, style.width, style.color, style.y, style.op, style.hdr, 2);
      }
    });
  }

  // VTA Light Rail Corridor (Caltrain already rendered above)
  if (Array.isArray(mvGisData.rail)) {
    mvGisData.rail.forEach((line) => {
      if (line.name.includes('Caltrain')) return;
      if (!Array.isArray(line.coords) || line.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of line.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        buildGlowingCorridor(pts, 0.85, 0xff9933, 0.042, 0.72, 1.4, 3);
      }
    });
  }

  // Permanente Creek Trail (Stevens Creek Trail already rendered above)
  if (Array.isArray(mvGisData.trails)) {
    mvGisData.trails.forEach((trail) => {
      if (trail.name.includes('Stevens Creek')) return;
      if (!Array.isArray(trail.coords) || trail.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of trail.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        buildGlowingCorridor(pts, 0.42, 0x3ae88a, 0.022, 0.65, 1.3, 2);
      }
    });
  }

  // 2 Station Markers (Downtown Transit Center & San Antonio Station)
  if (Array.isArray(mvGisData.stations)) {
    mvGisData.stations.forEach((st) => {
      const sc = geoToScene(st.coords[0], st.coords[1]);
      const stationRingGeo = new THREE.RingGeometry(0.8, 1.4, 24);
      stationRingGeo.rotateX(-Math.PI / 2);
      const stationRingMat = new THREE.MeshBasicMaterial({
        color: 0x44eeff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });
      const stMesh = new THREE.Mesh(stationRingGeo, stationRingMat);
      stMesh.position.set(sc.x, 0.065, sc.z);
      corridorsGroup.add(stMesh);
    });
  }

  // Waterbodies (Shoreline Lake, Charleston Slough)
  if (Array.isArray(mvGisData.water)) {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x165258,
      roughness: 0.28,
      metalness: 0.45,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    mvGisData.water.forEach((wb) => {
      if (wb.name === 'San Francisco Bay') return;
      if (Array.isArray(wb.polygon) && wb.polygon.length >= 3) {
        const shape = new THREE.Shape();
        for (let i = 0; i < wb.polygon.length - 1; i++) {
          const sc = geoToScene(wb.polygon[i][0], wb.polygon[i][1]);
          if (i === 0) shape.moveTo(sc.x, -sc.z);
          else shape.lineTo(sc.x, -sc.z);
        }
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, waterMat);
        mesh.position.y = 0.015;
        mesh.renderOrder = 1;
        cityRoot.add(mesh);
      }
    });
  }

  // Parks (Sylvan, Cuesta, Rengstorff, Whisman, Pioneer, Shoreline)
  if (Array.isArray(mvGisData.parks)) {
    const parkMat = new THREE.MeshStandardMaterial({
      color: 0x143c24,
      roughness: 0.78,
      metalness: 0.08,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    mvGisData.parks.forEach((park) => {
      if (Array.isArray(park.polygon) && park.polygon.length >= 3) {
        const shape = new THREE.Shape();
        for (let i = 0; i < park.polygon.length - 1; i++) {
          const sc = geoToScene(park.polygon[i][0], park.polygon[i][1]);
          if (i === 0) shape.moveTo(sc.x, -sc.z);
          else shape.lineTo(sc.x, -sc.z);
        }
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, parkMat);
        mesh.position.y = 0.018;
        mesh.renderOrder = 1;
        cityRoot.add(mesh);
      }
    });
  }
}
renderGisInfrastructure();

// ============================================================================
// 5C. HERO 3D ARCHITECTURAL LANDMARKS OF MOUNTAIN VIEW (1:1 SCULPTED)
// ============================================================================
const landmarksGroup = new THREE.Group();
cityRoot.add(landmarksGroup);

// 1. GOOGLE BAY VIEW CANOPY & CHARLESTON EAST COURTYARD CAMPUS (True geoToScene North Bayshore: x=6.8, z=-31.0)
function buildGoogleBayViewCanopy() {
  const group = new THREE.Group();
  group.name = 'GoogleBayViewCampus';
  group.position.set(6.8, 0, -31.0);
  group.rotation.y = 0.0;
  group.scale.setScalar(0.36);

  const warmGlazingMat = new THREE.MeshStandardMaterial({
    color: 0xffdf9e,
    emissive: 0xd8841c,
    emissiveIntensity: 0.68,
    roughness: 0.28
  });

  const canopyShellMat = new THREE.MeshStandardMaterial({
    color: 0xd8b882,
    emissive: 0x6e4414,
    emissiveIntensity: 0.26,
    roughness: 0.36,
    metalness: 0.28
  });

  const scaleDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3b2a17,
    roughness: 0.48,
    metalness: 0.22
  });

  const diamondRidgeMat = new THREE.LineBasicMaterial({
    color: 0xffe4a8,
    transparent: true,
    opacity: 0.86
  });

  function sampleCanopyY(vx, vz, w, d, h) {
    const nx = vx / (w * 0.5);
    const nz = vz / (d * 0.5);
    const edgeFalloff = Math.max(0, 1 - (nx * nx * 0.56 + nz * nz * 0.58));
    const billow1 = Math.exp(-(Math.pow(nx + 0.34, 2) * 3.4 + Math.pow(nz + 0.1, 2) * 3.0)) * 1.22;
    const billow2 = Math.exp(-(Math.pow(nx - 0.32, 2) * 3.4 + Math.pow(nz - 0.1, 2) * 3.0)) * 1.18;
    const ripples = Math.cos(nx * Math.PI * 2.5) * Math.cos(nz * Math.PI * 2.0) * 0.36;
    return h * 0.36 + edgeFalloff * h * 0.54 + billow1 + billow2 + Math.max(0, ripples);
  }

  // Submodule 1: Iconic Dragon-Scale Tortoise-Shell Canopy with 3D Diamond Scale Cells & Clerestory Glow
  function createDragonCanopyModule(w, d, h, ox, oz, name) {
    const mod = new THREE.Group();
    mod.name = name;
    mod.position.set(ox, 0, oz);

    const baseGeo = new THREE.BoxGeometry(w * 0.86, h * 0.46, d * 0.86);
    const baseMesh = new THREE.Mesh(baseGeo, warmGlazingMat);
    baseMesh.position.y = h * 0.23;
    baseMesh.castShadow = true;
    mod.add(baseMesh);

    const segX = 14;
    const segZ = 9;
    const roofGeo = new THREE.PlaneGeometry(w, d, segX, segZ);
    roofGeo.rotateX(-Math.PI / 2);
    const pos = roofGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, sampleCanopyY(vx, vz, w, d, h));
    }
    roofGeo.computeVertexNormals();

    const roofMesh = new THREE.Mesh(roofGeo, canopyShellMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    mod.add(roofMesh);

    // 3D Dark Bronze Diamond Scale Facets & Luminous Golden Dragon-Scale Ribs
    const diamondVerts = [];
    const cellGeo = new THREE.BoxGeometry(1, 0.06, 1);
    cellGeo.rotateY(Math.PI / 4);
    const cellW = (w / segX) * 0.52;
    const cellD = (d / segZ) * 0.52;

    for (let ix = 0; ix < segX; ix++) {
      for (let iz = 0; iz < segZ; iz++) {
        const x0 = -w * 0.5 + (ix / segX) * w;
        const x1 = -w * 0.5 + ((ix + 1) / segX) * w;
        const xm = (x0 + x1) * 0.5;
        const z0 = -d * 0.5 + (iz / segZ) * d;
        const z1 = -d * 0.5 + ((iz + 1) / segZ) * d;
        const zm = (z0 + z1) * 0.5;
        const ym = sampleCanopyY(xm, zm, w, d, h);

        const cellMesh = new THREE.Mesh(cellGeo, scaleDarkMat);
        cellMesh.position.set(xm, ym + 0.02, zm);
        cellMesh.scale.set(cellW, 1, cellD);
        mod.add(cellMesh);

        const pN = [xm, sampleCanopyY(xm, z0, w, d, h) + 0.06, z0];
        const pE = [x1, sampleCanopyY(x1, zm, w, d, h) + 0.06, zm];
        const pS = [xm, sampleCanopyY(xm, z1, w, d, h) + 0.06, z1];
        const pW = [x0, sampleCanopyY(x0, zm, w, d, h) + 0.06, zm];

        diamondVerts.push(...pN, ...pE, ...pE, ...pS, ...pS, ...pW, ...pW, ...pN);
      }
    }
    const diamondGeo = new THREE.BufferGeometry();
    diamondGeo.setAttribute('position', new THREE.Float32BufferAttribute(diamondVerts, 3));
    mod.add(new THREE.LineSegments(diamondGeo, diamondRidgeMat));

    return mod;
  }

  group.add(createDragonCanopyModule(9.0, 8.0, 3.8, -5.2, -10.5, 'BayViewEastCanopy'));
  group.add(createDragonCanopyModule(8.5, 7.8, 3.6, 5.2, -10.5, 'BayViewWestCanopy'));
  group.add(createDragonCanopyModule(6.0, 5.5, 3.0, 0.0, -18.2, 'BayViewEventCenter'));

  // Submodule 2: Crisp Architectural Charleston East Courtyard Pavilion (Warm Ivory Roof + Recessed Bronze Skylight Wells)
  const atriumMod = new THREE.Group();
  atriumMod.name = 'CharlestonEastAtrium';
  atriumMod.position.set(0.5, 0, 5.5);

  // Lower glowing glass curtain-wall plinth
  const atriumPlinth = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.95, 8.4), warmGlazingMat);
  atriumPlinth.position.y = 0.48;
  atriumPlinth.castShadow = true;
  atriumMod.add(atriumPlinth);

  // Upper crisp champagne-alabaster architectural tier
  const atriumUpperMat = new THREE.MeshStandardMaterial({
    color: 0xf4e6ca,
    emissive: 0x8a5212,
    emissiveIntensity: 0.22,
    roughness: 0.38,
    metalness: 0.08
  });
  const atriumUpper = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.35, 8.2), atriumUpperMat);
  atriumUpper.position.y = 1.62;
  atriumUpper.castShadow = true;
  atriumUpper.receiveShadow = true;
  atriumMod.add(atriumUpper);

  const atriumRoof = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.18, 7.8), atriumUpperMat);
  atriumRoof.position.y = 2.38;
  atriumMod.add(atriumRoof);

  // Sculpted organic bronze atrium skylight wells
  const skylightMat = new THREE.MeshStandardMaterial({ color: 0x362411, roughness: 0.45 });
  [
    [-2.4, -0.8, 2.3, 1.5, 0.25],
    [2.1, 0.9, 2.5, 1.6, -0.2],
    [-0.2, 0.1, 1.5, 1.1, 0.38]
  ].forEach(([sx, sz, sw, sd, rot]) => {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.14, sd), skylightMat);
    sk.position.set(sx, 2.50, sz);
    sk.rotation.y = rot;
    atriumMod.add(sk);
  });
  group.add(atriumMod);

  // Warm ambient courtyard lights for North Bayshore campus
  const bayviewLight1 = new THREE.PointLight(0xffc66c, 2.2, 30, 1.5);
  bayviewLight1.position.set(-0.5, 4.6, -9.5);
  group.add(bayviewLight1);

  const bayviewLight2 = new THREE.PointLight(0xffba52, 2.0, 28, 1.5);
  bayviewLight2.position.set(0.5, 4.2, 5.5);
  group.add(bayviewLight2);

  // Surrounding Crisp White North Bayshore Campus Annex Buildings (all strictly separated >= 0.5 local units)
  const annexWallMat = new THREE.MeshStandardMaterial({
    color: 0xf0ede4,
    emissive: 0x4a2e0e,
    emissiveIntensity: 0.14,
    roughness: 0.40,
    metalness: 0.08
  });
  const annexRoofMat = new THREE.MeshStandardMaterial({
    color: 0xdad5ca,
    roughness: 0.52
  });

  const annexes = [
    [-11.5, -18.5, 5.5, 1.85, 4.5, 'BayViewAnnexNW1'],
    [11.5, -18.5, 5.5, 1.85, 4.5, 'BayViewAnnexNE'],
    [-12.5, -10.5, 4.5, 2.05, 5.5, 'BayViewAnnexWest'],
    [12.5, -10.5, 4.5, 2.05, 5.5, 'BayViewAnnexEast'],
    [-8.5, 5.5, 3.2, 2.05, 5.0, 'BayViewAnnexSW1'],
    [2.2, 14.5, 8.0, 2.2, 4.5, 'BayViewAnnexSE'],
    [9.5, 5.5, 4.0, 2.15, 6.0, 'BayViewAnnexFarEast']
  ];
  annexes.forEach(([ax, az, aw, ah, ad, name]) => {
    const annexMod = new THREE.Group();
    annexMod.name = name;
    annexMod.position.set(ax, 0, az);

    // Warm ground-floor window band
    const baseBand = new THREE.Mesh(new THREE.BoxGeometry(aw * 0.96, 0.42, ad * 0.96), warmGlazingMat);
    baseBand.position.set(0, 0.21, 0);
    annexMod.add(baseBand);

    const m = new THREE.Mesh(new THREE.BoxGeometry(aw, ah - 0.35, ad), annexWallMat);
    m.position.set(0, 0.35 + (ah - 0.35) * 0.5, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    annexMod.add(m);

    const rCap = new THREE.Mesh(new THREE.BoxGeometry(aw * 0.82, 0.16, ad * 0.82), annexRoofMat);
    rCap.position.set(0, ah + 0.08, 0);
    annexMod.add(rCap);

    group.add(annexMod);
  });

  landmarksGroup.add(group);
  return group;
}

// 2. SHORELINE AMPHITHEATRE (Twin-Spire Scalloped Hyperbolic-Paraboloid Tensile Tent at True geoToScene: x=-2.8, z=-36.5)
function buildShorelineAmphitheatre() {
  const group = new THREE.Group();
  group.name = 'ShorelineAmphitheatre';
  group.position.set(-2.8, 0, -36.5);
  group.scale.setScalar(0.42);

  // Dark circular landscape ring road & stepped architectural seating bowl
  const padGeo = new THREE.CylinderGeometry(8.3, 8.9, 0.42, 48);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x161c24, roughness: 0.74 });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.y = 0.21;
  group.add(padMesh);

  const bowlGeo = new THREE.CylinderGeometry(6.3, 7.3, 0.92, 36);
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xd2cfc6, roughness: 0.48 });
  const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
  bowlMesh.position.y = 0.52;
  bowlMesh.castShadow = true;
  bowlMesh.receiveShadow = true;
  group.add(bowlMesh);

  // Front entrance pavilion blocks & perimeter tensile masts
  const pavMat = new THREE.MeshStandardMaterial({ color: 0xeae7df, roughness: 0.44 });
  [[-3.2, 5.2], [0.0, 5.8], [3.2, 5.2]].forEach(([px, pz]) => {
    const pav = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.05, 1.7), pavMat);
    pav.position.set(px, 0.52, pz);
    pav.castShadow = true;
    group.add(pav);
  });

  // Sculpted 8-Scallop Twin-Spire Hyperbolic Paraboloid Tensile Membrane
  const sampleTentHeight = (sx, sz) => {
    const dMain1 = Math.hypot((sx + 2.45) * 0.95, sz + 0.15);
    const dMain2 = Math.hypot((sx - 2.45) * 0.95, sz - 0.15);
    const dWing1 = Math.hypot(sx + 5.1, sz - 1.4);
    const dWing2 = Math.hypot(sx - 5.1, sz - 1.4);
    const dBack1 = Math.hypot(sx + 3.8, sz + 3.2);
    const dBack2 = Math.hypot(sx - 3.8, sz + 3.2);

    const spire1 = 7.4 * Math.exp(-dMain1 * 0.58);
    const spire2 = 7.1 * Math.exp(-dMain2 * 0.60);
    const wing1 = 3.6 * Math.exp(-dWing1 * 0.72);
    const wing2 = 3.6 * Math.exp(-dWing2 * 0.72);
    const back1 = 3.2 * Math.exp(-dBack1 * 0.75);
    const back2 = 3.2 * Math.exp(-dBack2 * 0.75);
    const saddle = 2.0 * Math.exp(-Math.hypot(sx * 0.65, sz) * 0.34);

    return 0.88 + Math.max(spire1, spire2, wing1, wing2, back1, back2, saddle);
  };

  const tentGeo = new THREE.PlaneGeometry(15.6, 13.0, 64, 64);
  tentGeo.rotateX(-Math.PI / 2);
  const pos = tentGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const scallopRadius = 6.4 + 1.15 * Math.cos(angle * 8);
    const r = Math.hypot(x * 0.86, z);
    let sx = x;
    let sz = z;
    if (r > scallopRadius) {
      sx = x * (scallopRadius / r);
      sz = z * (scallopRadius / r);
      pos.setX(i, sx);
      pos.setZ(i, sz);
    }
    pos.setY(i, sampleTentHeight(sx, sz));
  }
  tentGeo.computeVertexNormals();

  const tentMat = new THREE.MeshStandardMaterial({
    color: 0xf8f6f0,
    emissive: 0x3a2a14,
    emissiveIntensity: 0.14,
    roughness: 0.30,
    metalness: 0.06,
    side: THREE.DoubleSide
  });
  const tentMesh = new THREE.Mesh(tentGeo, tentMat);
  tentMesh.castShadow = true;
  tentMesh.receiveShadow = true;
  group.add(tentMesh);

  // Subtle radial catenary seam lines converging to the twin spires
  const seamVerts = [];
  const spireTips = [
    [-2.45, sampleTentHeight(-2.45, -0.15) + 0.05, -0.15],
    [2.45, sampleTentHeight(2.45, 0.15) + 0.05, 0.15]
  ];
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const rad = 6.4 + 1.15 * Math.cos(ang * 8);
    const ex = (Math.cos(ang) * rad) / 0.86;
    const ez = Math.sin(ang) * rad;
    const tip = ex < 0 ? spireTips[0] : spireTips[1];
    const midX = (tip[0] + ex) * 0.5;
    const midZ = (tip[2] + ez) * 0.5;
    const midY = sampleTentHeight(midX, midZ) + 0.04;
    seamVerts.push(tip[0], tip[1], tip[2], midX, midY, midZ);
    seamVerts.push(midX, midY, midZ, ex, sampleTentHeight(ex, ez) + 0.03, ez);
  }
  const seamLineGeo = new THREE.BufferGeometry();
  seamLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamVerts, 3));
  group.add(
    new THREE.LineSegments(
      seamLineGeo,
      new THREE.LineBasicMaterial({ color: 0xc4bfb4, transparent: true, opacity: 0.52 })
    )
  );

  // Warm vertical stage lantern cleft nestled cleanly inside the central saddle between the twin spires
  const lanternGeo = new THREE.CylinderGeometry(0.16, 0.65, 2.2, 12);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd278 });
  const lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
  lanternMesh.position.set(0, 1.85, 0.25);
  group.add(lanternMesh);

  const tentLight = new THREE.PointLight(0xffc868, 1.6, 18, 1.5);
  tentLight.position.set(0, 3.2, 0.5);
  group.add(tentLight);

  landmarksGroup.add(group);
  return group;
}

// 3. NASA AMES HANGAR ONE (1:1 Open-Ended Steel Lattice Barrel-Vault Arch at True geoToScene Moffett: x=30.5, z=-22.5)
function buildNasaHangarOne() {
  const group = new THREE.Group();
  group.name = 'NasaAmesHangarOne';
  group.position.set(30.5, 0, -22.5);
  group.rotation.y = 0.52;
  group.scale.setScalar(0.48);

  const length = 21.5;
  const width = 10.6;
  const height = 7.4;

  const sampleArchPt = (uArc, vLen, radialScale = 1.0) => {
    const theta = uArc * Math.PI;
    const x = Math.cos(theta) * (width * 0.5) * radialScale;
    const y = Math.sin(theta) * height * radialScale;
    const z = (vLen - 0.5) * length;
    return [x, y, z];
  };

  // Dark recessed hangar floor slab inside the open arch
  const floorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.96, 0.24, length * 0.98),
    new THREE.MeshStandardMaterial({ color: 0x090c12, roughness: 0.82 })
  );
  floorSlab.position.y = 0.12;
  floorSlab.receiveShadow = true;
  group.add(floorSlab);

  // Subtle dark semi-translucent inner vault shadow liner
  const linerSegArc = 24;
  const linerSegLen = 12;
  const linerGeo = new THREE.PlaneGeometry(1, 1, linerSegArc, linerSegLen);
  const lPos = linerGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const uArc = lPos.getX(i) + 0.5;
    const vLen = lPos.getY(i) + 0.5;
    const [ax, ay, az] = sampleArchPt(uArc, vLen, 0.93);
    lPos.setXYZ(i, ax, ay, az);
  }
  linerGeo.computeVertexNormals();
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0x0e131b,
    roughness: 0.68,
    metalness: 0.32,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide
  });
  group.add(new THREE.Mesh(linerGeo, linerMat));

  // Open-Ended 3D Parabolic Steel Truss Lattice (Crisp Metallic Space-Frame Arch)
  const numRibs = 16;
  const numArcSegs = 18;
  const latticeVerts = [];

  for (let iz = 0; iz <= numRibs; iz++) {
    const v0 = iz / numRibs;
    const v1 = (iz + 1) / numRibs;
    for (let ia = 0; ia < numArcSegs; ia++) {
      const u0 = ia / numArcSegs;
      const u1 = (ia + 1) / numArcSegs;

      const p00 = sampleArchPt(u0, v0, 1.0);
      const p10 = sampleArchPt(u1, v0, 1.0);
      latticeVerts.push(...p00, ...p10);

      const p00In = sampleArchPt(u0, v0, 0.93);
      latticeVerts.push(...p00, ...p00In);

      if (iz < numRibs) {
        const p01 = sampleArchPt(u0, v1, 1.0);
        const p11 = sampleArchPt(u1, v1, 1.0);
        latticeVerts.push(...p00, ...p01);
        latticeVerts.push(...p00, ...p11);
        latticeVerts.push(...p10, ...p01);
      }
    }
  }

  const latticeGeo = new THREE.BufferGeometry();
  latticeGeo.setAttribute('position', new THREE.Float32BufferAttribute(latticeVerts, 3));
  const latticeMat = new THREE.LineBasicMaterial({
    color: 0xd8e0ea,
    transparent: true,
    opacity: 0.78
  });
  group.add(new THREE.LineSegments(latticeGeo, latticeMat));

  // Solid 3D Primary Steel Arch Ribs along the barrel
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0xe6ebf2,
    roughness: 0.34,
    metalness: 0.46
  });
  for (let iz = 0; iz <= 10; iz++) {
    const zPos = ((iz / 10) - 0.5) * length;
    const ribGeo = new THREE.TorusGeometry(width * 0.5, 0.085, 6, 28, Math.PI);
    ribGeo.scale(1.0, height / (width * 0.5), 1.0);
    const ribMesh = new THREE.Mesh(ribGeo, ribMat);
    ribMesh.position.z = zPos;
    ribMesh.castShadow = true;
    group.add(ribMesh);
  }

  // Row of White Vertical Base Buttress Piers along both flanks
  const buttressMat = new THREE.MeshStandardMaterial({ color: 0xeceae2, roughness: 0.46 });
  const buttressGeo = new THREE.BoxGeometry(0.44, 1.35, 0.32);
  for (let iz = 0; iz <= 14; iz++) {
    const zPos = ((iz / 14) - 0.5) * (length * 0.94);
    [-width * 0.5, width * 0.5].forEach((xSide) => {
      const pier = new THREE.Mesh(buttressGeo, buttressMat);
      pier.position.set(xSide, 0.68, zPos);
      pier.castShadow = true;
      group.add(pier);
    });
  }

  // Flanking White Rectangular Airfield Annex Buildings:
  const annexMat = new THREE.MeshStandardMaterial({ color: 0xeceae2, roughness: 0.44 });
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.95, 8.8), annexMat);
  h1.position.set(7.4, 0.98, -2.2);
  h1.castShadow = true;
  h1.receiveShadow = true;
  group.add(h1);

  const h2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.35, 6.4), annexMat);
  h2.position.set(-7.1, 0.68, 1.8);
  h2.castShadow = true;
  h2.receiveShadow = true;
  group.add(h2);

  landmarksGroup.add(group);
  return group;
}

buildGoogleBayViewCanopy();
buildShorelineAmphitheatre();
buildNasaHangarOne();
landmarksGroup.updateMatrixWorld(true);

// District Hero Landmarks (Downtown Transit Center & San Antonio Center)
const districtLandmarksGroup = new THREE.Group();
districtLandmarksGroup.name = 'DistrictLandmarksGroup';
cityRoot.add(districtLandmarksGroup);

function buildDowntownTransitCenter() {
  const group = new THREE.Group();
  group.name = 'MountainViewDowntownTransitCenter';
  group.position.set(3.5, 0, 7.0);
  group.scale.setScalar(0.55);

  const stuccoMat = new THREE.MeshStandardMaterial({ color: 0xede6d8, roughness: 0.65 });
  const tileRoofMat = new THREE.MeshStandardMaterial({ color: 0xc45c2c, roughness: 0.45 });
  const clockFaceMat = new THREE.MeshBasicMaterial({ color: 0xfffae6 });

  // Main Station Depot
  const depot = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.8, 3.2), stuccoMat);
  depot.position.y = 0.9;
  depot.castShadow = true;
  group.add(depot);

  // Terra-cotta Hip Roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.2, 4), tileRoofMat);
  roof.position.y = 2.4;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Historic Spanish Mission Clock Tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.8, 1.4), stuccoMat);
  tower.position.set(2.4, 2.4, 0.8);
  tower.castShadow = true;
  group.add(tower);

  const towerCap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.5, 4), tileRoofMat);
  towerCap.position.set(2.4, 5.55, 0.8);
  towerCap.rotation.y = Math.PI / 4;
  group.add(towerCap);

  // Clock face
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16), clockFaceMat);
  clock.position.set(2.4, 4.2, 1.52);
  clock.rotation.x = Math.PI / 2;
  group.add(clock);

  // Caltrain passenger platform canopy
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.12, 1.8), stuccoMat);
  canopy.position.set(-2.2, 1.4, -2.0);
  group.add(canopy);

  districtLandmarksGroup.add(group);
  return group;
}

function buildSanAntonioCenter() {
  const group = new THREE.Group();
  group.name = 'SanAntonioCenter';
  group.position.set(-31.5, 0, -8.0);
  group.scale.setScalar(0.55);

  const modernPodiumMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.42 });
  const glassArcadeMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a0,
    emissive: 0xd8881c,
    emissiveIntensity: 0.35,
    roughness: 0.28
  });
  const terraceRoofMat = new THREE.MeshStandardMaterial({ color: 0x3a6042, roughness: 0.82 });

  // Mixed-Use Podium
  const podium = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.4, 6.2), modernPodiumMat);
  podium.position.y = 0.7;
  podium.castShadow = true;
  group.add(podium);

  // Glass retail arcade spine
  const arcade = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.7, 1.8), glassArcadeMat);
  arcade.position.set(0, 0.35, 0);
  group.add(arcade);

  // Residential Towers
  const tower1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 2.6), modernPodiumMat);
  tower1.position.set(-2.0, 2.3, 1.4);
  tower1.castShadow = true;
  group.add(tower1);

  const tower2 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 2.6), modernPodiumMat);
  tower2.position.set(2.0, 2.0, -1.2);
  tower2.castShadow = true;
  group.add(tower2);

  // Landscaped roof terrace
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 2.4), terraceRoofMat);
  terrace.position.set(-2.0, 3.94, 1.4);
  group.add(terrace);

  districtLandmarksGroup.add(group);
  return group;
}

buildDowntownTransitCenter();
buildSanAntonioCenter();
districtLandmarksGroup.updateMatrixWorld(true);

// Pre-sample corridor curves and landmark bounding boxes for exact mathematical clearance
function sampleCurvePoints(curve, count = 200) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    pts.push(curve.getPointAt(i / count));
  }
  return pts;
}

const us101Samples = sampleCurvePoints(us101Main.curve, 240);
const ecrSamples = sampleCurvePoints(ecrMain.curve, 160);
const caltrainSamples = sampleCurvePoints(caltrainMain.curve, 160);
const castroSamples = sampleCurvePoints(castroMain.curve, 140);
const shorelineSamples = sampleCurvePoints(shorelineMain.curve, 90);
const stevensCreekSamples = sampleCurvePoints(stevensCreekCurve, 180);

function minDistBoxToSamples(minX, maxX, minZ, maxZ, samples) {
  let best = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const pt = samples[i];
    const dx = Math.max(minX - pt.x, 0, pt.x - maxX);
    const dz = Math.max(minZ - pt.z, 0, pt.z - maxZ);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

const landmarkWorldBoxes = landmarksGroup.children.map((lm) => {
  lm.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(lm);
});

// 4. STEVENS CREEK GREENBELT 3D TREE CANOPY CLUSTER (Lush Volumetric Forest Ravine tucked along stevensCreekCurve)
function buildStevensCreekTrees() {
  const treeGroup = new THREE.Group();
  const rand = createSeededRandom(7731);
  const crownGeo = new THREE.DodecahedronGeometry(0.54, 1);
  const treeMats = [
    new THREE.MeshStandardMaterial({ color: 0x0e331c, emissive: 0x04140a, emissiveIntensity: 0.16, roughness: 0.86 }),
    new THREE.MeshStandardMaterial({ color: 0x164a29, emissive: 0x061d0f, emissiveIntensity: 0.18, roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: 0x206038, emissive: 0x082614, emissiveIntensity: 0.20, roughness: 0.82 })
  ];

  for (let i = 0; i < 520; i++) {
    const t = i / 520;
    const useBraid = i % 3 === 0 && t < 0.65;
    const pt = (useBraid ? stevensCreekBraidedCurve : stevensCreekCurve).getPointAt(t);
    const spread = t < 0.35 ? 3.2 : 2.6;
    const cx = pt.x + (rand() - 0.5) * spread;
    const cz = pt.z + (rand() - 0.5) * spread;
    const s = 0.38 + rand() * 0.52;

    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, us101Samples) < 2.15) continue;
    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, caltrainSamples) < 1.95) continue;
    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, ecrSamples) < 1.85) continue;
    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, castroSamples) < 1.75) continue;

    const tree = new THREE.Mesh(crownGeo, treeMats[i % 3]);
    tree.position.set(cx, s * 0.38, cz);
    tree.scale.set(s * 1.08, s * 0.76, s * 1.08);
    tree.castShadow = true;
    treeGroup.add(tree);
  }
  cityRoot.add(treeGroup);
}
buildStevensCreekTrees();

// ============================================================================
// 5D. INTERACTIVE GEO-REFERENCED MOUNTAIN VIEW PARCELS (8,200 REAL OSM BUILDINGS)
// ============================================================================
const parcelsGroup = new THREE.Group();
cityRoot.add(parcelsGroup);

const staticBuildingsGroup = new THREE.Group();
staticBuildingsGroup.name = 'StaticBuildingsGroup';
cityRoot.add(staticBuildingsGroup);

const parcelRecords = [];
const interactableMeshes = [];

function isInsideWaterOrReserve(x, z) {
  if (z < -45.5) return true;
  return false;
}

function isInsideExclusionZone(x, z, halfW = 1.95, halfD = 1.95, allowNorthOf101 = false) {
  const minX = x - halfW;
  const maxX = x + halfW;
  const minZ = z - halfD;
  const maxZ = z + halfD;

  if (!allowNorthOf101 && isInsideWaterOrReserve(x, z)) return true;

  // Keep inside the beveled table perimeter
  if (minX < -66.8 || maxX > 66.8 || minZ < -66.8 || maxZ > 66.8) return true;

  // Exact Landmark Bounding-Box Clearance
  for (const box of landmarkWorldBoxes) {
    if (
      maxX > box.min.x - 1.35 &&
      minX < box.max.x + 1.35 &&
      maxZ > box.min.z - 1.35 &&
      minZ < box.max.z + 1.35
    ) {
      return true;
    }
  }

  // Exact Corridor & Creek Clearance (guarantees 0 violations in checkCorridorClearance)
  if (minDistBoxToSamples(minX, maxX, minZ, maxZ, us101Samples) < 2.28) return true;
  if (minDistBoxToSamples(minX, maxX, minZ, maxZ, caltrainSamples) < 1.58) return true;
  if (minDistBoxToSamples(minX, maxX, minZ, maxZ, ecrSamples) < 1.48) return true;
  if (minDistBoxToSamples(minX, maxX, minZ, maxZ, castroSamples) < 1.34) return true;
  if (minDistBoxToSamples(minX, maxX, minZ, maxZ, shorelineSamples) < 1.12) return true;
  if (minDistBoxToSamples(minX, maxX, minZ, maxZ, stevensCreekSamples) < 1.68) return true;

  return false;
}

function classifyDistrict(x, z) {
  if (z < getUs101ZAtX(x) - 1.0 && x < 16.0) {
    return {
      district: 'NB_PP',
      districtName: 'North Bayshore & Shoreline Gateway',
      baseZone: 'MU6'
    };
  }
  if (Math.hypot(x - 1.0, z - 12.0) < 12.0) {
    return {
      district: 'DT_CRA',
      districtName: 'Downtown Castro Street Precise Plan',
      baseZone: 'TOD10'
    };
  }
  if (x < -18.0 || Math.abs(z - (0.62 * x + 21.0)) < 7.5) {
    return {
      district: 'ECR_MU',
      districtName: 'El Camino & San Antonio Transit Corridor',
      baseZone: 'MU6'
    };
  }
  if (x > 10.0 && z < 20.0) {
    return {
      district: 'EW_TOD',
      districtName: 'East Whisman & Moffett TOD',
      baseZone: 'MU6'
    };
  }
  return {
    district: 'RES_SF',
    districtName: 'Old Mountain View / Residential Neighborhoods',
    baseZone: 'R1'
  };
}

function generateCityParcels() {
  const rand = createSeededRandom(20261016);
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  unitBoxGeo.translate(0, 0.5, 0);

  const recessedCourtyardMat = new THREE.MeshStandardMaterial({
    color: 0x121720,
    roughness: 0.82,
    metalness: 0.12
  });

  const roofAccentMat = new THREE.MeshStandardMaterial({
    color: 0xd8d4ca,
    roughness: 0.48,
    metalness: 0.08
  });

  const warmCourtMat = new THREE.MeshStandardMaterial({
    color: 0xf6d89c,
    emissive: 0xd8821c,
    emissiveIntensity: 0.42,
    roughness: 0.42
  });

  let idx = 100;

  function registerParcelRecord(x, z, w, d, origHeight, info, nearAmberSpine, mat, mesh) {
    const elevationThreshold = z < -15 ? 0.35 + rand() * 0.65 : 0.95 + rand() * 0.9;
    const record = {
      id: `MV-${info.district.split('_')[0]}-${idx++}`,
      district: info.district,
      districtName: info.districtName,
      baseZone: info.baseZone,
      currentZoneKey: info.baseZone,
      currentZoneCode: ZONE_DEFS[info.baseZone].code,
      x,
      z,
      w,
      d,
      origHeight,
      baseHeightScale: 1.0,
      currentHeight: origHeight,
      targetHeight: origHeight,
      targetFar: ZONE_DEFS[info.baseZone].baseFar,
      units: 24,
      jobs: 40,
      greenRatio: 0.2,
      heatDelta: 0.0,
      floodRisk: 0.0,
      elevationThreshold,
      warmLit: nearAmberSpine,
      baseColorHex: mat.color.getHex(),
      baseEmissiveHex: mat.emissive.getHex(),
      baseEmissiveIntensity: mat.emissiveIntensity,
      mesh,
      mat
    };

    mesh.traverse((child) => {
      if (child.isMesh) {
        child.userData.parcel = record;
        interactableMeshes.push(child);
      }
    });
    parcelRecords.push(record);
  }

  if (mvGisData && Array.isArray(mvGisData.buildings) && mvGisData.buildings.length > 0) {
    // Extrude Authentic 3D GIS Building Footprints (8,200 genuine buildings inside Mountain View from OSM)
    function mapGisDistrict(gisDistrict) {
      if (gisDistrict === 'Downtown Castro') return 'DT_CRA';
      if (gisDistrict === 'El Camino Real' || gisDistrict === 'San Antonio') return 'ECR_MU';
      if (gisDistrict === 'East Whisman' || gisDistrict === 'General Commercial') return 'EW_TOD';
      if (gisDistrict === 'North Bayshore') return 'NB_PP';
      return 'RES_SF';
    }

    const targetCounts = { DT_CRA: 60, ECR_MU: 75, EW_TOD: 65, NB_PP: 65, RES_SF: 75 };
    const selectedCounts = { DT_CRA: 0, ECR_MU: 0, EW_TOD: 0, NB_PP: 0, RES_SF: 0 };
    const districtGeos = { DT_CRA: [], ECR_MU: [], EW_TOD: [], NB_PP: [], RES_SF: [] };

    for (const b of mvGisData.buildings) {
      const poly = b.polygon;
      if (!Array.isArray(poly) || poly.length < 3) continue;
      // Omit duplicate ring-closure vertex poly[poly.length - 1] before shape.closePath() to prevent degenerate edges
      const numPts = (poly.length > 3 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1])
        ? poly.length - 1
        : poly.length;

      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const scenePts = [];
      for (let i = 0; i < numPts; i++) {
        const sc = geoToScene(poly[i][0], poly[i][1]);
        if (!scenePts.length || Math.hypot(sc.x - scenePts[scenePts.length - 1].x, sc.z - scenePts[scenePts.length - 1].z) > 0.04) {
          scenePts.push(sc);
          if (sc.x < minX) minX = sc.x;
          if (sc.x > maxX) maxX = sc.x;
          if (sc.z < minZ) minZ = sc.z;
          if (sc.z > maxZ) maxZ = sc.z;
        }
      }
      if (scenePts.length < 3) continue;
      if (minX < -66.8 || maxX > 66.8 || minZ < -66.8 || maxZ > 66.8) continue;

      const cx = (minX + maxX) * 0.5;
      const cz = (minZ + maxZ) * 0.5;

      // Skip raw OSM footprints directly overlapping our 3 sculpted hero landmark footprints to prevent z-fighting
      if (Math.hypot(cx - 6.8, cz + 31.0) < 5.2) continue;
      if (Math.hypot(cx + 2.8, cz + 36.5) < 4.2) continue;
      if (Math.hypot(cx - 30.5, cz + 22.5) < 5.8) continue;

      const d101 = minDistBoxToSamples(minX, maxX, minZ, maxZ, us101Samples);
      const dCal = minDistBoxToSamples(minX, maxX, minZ, maxZ, caltrainSamples);
      const dEcr = minDistBoxToSamples(minX, maxX, minZ, maxZ, ecrSamples);
      const dCreek = minDistBoxToSamples(minX, maxX, minZ, maxZ, stevensCreekSamples);

      const isCleared = (d101 >= 2.3 && dCal >= 1.6 && dEcr >= 1.5 && dCreek >= 1.7);
      const dist = mapGisDistrict(b.district);

      if (isCleared && selectedCounts[dist] < targetCounts[dist]) {
        selectedCounts[dist]++;
        const w = Math.max(maxX - minX, 2.6);
        const d = Math.max(maxZ - minZ, 2.6);
        const origHeight = b.height_m
          ? Math.max(0.55, Math.min(2.4, b.height_m * 0.11))
          : (b.levels ? b.levels * 0.38 : 0.95);

        const shape = new THREE.Shape();
        for (let k = 0; k < scenePts.length; k++) {
          const lx = scenePts[k].x - cx;
          const lz = scenePts[k].z - cz;
          if (k === 0) shape.moveTo(lx, -lz);
          else shape.lineTo(lx, -lz);
        }
        shape.closePath();

        const bGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
        bGeo.rotateX(-Math.PI / 2);

        const nearAmberSpine = (dist === 'DT_CRA' || dist === 'ECR_MU') && (dEcr < 6.5 || Math.hypot(cx - 1.0, cz - 13.0) < 12.0);

        const mat = new THREE.MeshStandardMaterial({
          color: nearAmberSpine ? 0xf7f0e4 : (dist === 'RES_SF' ? 0xeceae3 : 0xf3f0e8),
          emissive: nearAmberSpine ? 0xd47c18 : 0x10161e,
          emissiveIntensity: nearAmberSpine ? 0.28 : 0.025,
          roughness: 0.40,
          metalness: 0.08
        });

        const mesh = new THREE.Group();
        mesh.position.set(cx, 0, cz);
        mesh.scale.set(1, origHeight, 1);
        const bMesh = new THREE.Mesh(bGeo, mat);
        bMesh.castShadow = true;
        bMesh.receiveShadow = true;
        mesh.add(bMesh);
        parcelsGroup.add(mesh);

        const info = {
          district: dist,
          districtName: dist === 'DT_CRA' ? 'Downtown Castro Street Precise Plan' :
                        dist === 'ECR_MU' ? 'El Camino & Caltrain Transit Corridor' :
                        dist === 'EW_TOD' ? 'East Whisman & Middlefield TOD' :
                        dist === 'NB_PP' ? 'North Bayshore & Shoreline Gateway' :
                        'Old Mountain View / Residential Gentle Density',
          baseZone: dist === 'DT_CRA' ? 'TOD10' :
                    dist === 'ECR_MU' ? 'MU6' :
                    dist === 'EW_TOD' ? 'MU6' :
                    dist === 'NB_PP' ? 'MU6' : 'R1'
        };

        const elevationThreshold = cz < -15 ? 0.35 + rand() * 0.65 : 0.95 + rand() * 0.9;
        const record = {
          id: b.id || `MV-${dist.split('_')[0]}-${idx++}`,
          name: b.name || `${info.districtName} Parcel`,
          district: dist,
          districtName: info.districtName,
          baseZone: info.baseZone,
          currentZoneKey: info.baseZone,
          currentZoneCode: ZONE_DEFS[info.baseZone].code,
          x: cx,
          z: cz,
          w,
          d,
          lat: b.center ? b.center[1] : sceneToGeo(cx, cz).lat,
          lon: b.center ? b.center[0] : sceneToGeo(cx, cz).lon,
          areaSqm: b.area_m2 || Math.round(w * d * 180),
          levels: b.levels || Math.max(1, Math.round(origHeight * 1.8)),
          heightM: b.height_m || +(origHeight * 4.2).toFixed(1),
          origHeight,
          baseHeightScale: 1.0,
          currentHeight: origHeight,
          targetHeight: origHeight,
          targetFar: ZONE_DEFS[info.baseZone].baseFar,
          units: Math.round(Math.max(12, (w * d) / 6.5 * ZONE_DEFS[info.baseZone].unitsPerArea * 18)),
          jobs: Math.round((w * d) / 6.5 * ZONE_DEFS[info.baseZone].jobsPerArea * 26),
          greenRatio: 0.2,
          heatDelta: 0.0,
          floodRisk: 0.0,
          elevationThreshold,
          warmLit: nearAmberSpine,
          baseColorHex: mat.color.getHex(),
          baseEmissiveHex: mat.emissive.getHex(),
          baseEmissiveIntensity: mat.emissiveIntensity,
          mesh,
          mat
        };

        mesh.traverse((child) => {
          if (child.isMesh) {
            child.userData.parcel = record;
            interactableMeshes.push(child);
          }
        });
        parcelRecords.push(record);
      } else {
        // Merge into district static geometry
        const shape = new THREE.Shape();
        for (let k = 0; k < scenePts.length; k++) {
          if (k === 0) shape.moveTo(scenePts[k].x, -scenePts[k].z);
          else shape.lineTo(scenePts[k].x, -scenePts[k].z);
        }
        shape.closePath();
        const h = b.height_m ? Math.max(0.42, Math.min(2.6, b.height_m * 0.11)) : (b.levels ? b.levels * 0.36 : 0.78);
        const bGeo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
        bGeo.rotateX(-Math.PI / 2);
        districtGeos[dist].push(bGeo);
      }
    }

    // Merge static district geometries using BufferGeometryUtils in safe batches
    for (const dKey of Object.keys(districtGeos)) {
      const geos = districtGeos[dKey];
      if (geos.length > 0) {
        const batchSize = 800;
        const baseColorHex = dKey === 'RES_SF' ? 0xe4e1d8 : (dKey === 'DT_CRA' ? 0xf5f0e6 : 0xedeae2);
        const distMat = new THREE.MeshStandardMaterial({
          color: baseColorHex,
          emissive: dKey === 'DT_CRA' ? 0x382008 : 0x10161e,
          emissiveIntensity: dKey === 'DT_CRA' ? 0.12 : 0.025,
          roughness: 0.44,
          metalness: 0.08
        });
        for (let bi = 0; bi < geos.length; bi += batchSize) {
          const chunk = geos.slice(bi, bi + batchSize);
          const mergedGeo = BufferGeometryUtils.mergeGeometries(chunk, false);
          if (mergedGeo) {
            const distMesh = new THREE.Mesh(mergedGeo, distMat);
            distMesh.castShadow = true;
            distMesh.receiveShadow = true;
            distMesh.userData.district = dKey;
            distMesh.userData.baseColorHex = baseColorHex;
            distMesh.userData.currentScaleY = 1.0;
            staticBuildingsGroup.add(distMesh);
          }
        }
      }
    }
  } else {
    // Fallback Part B: Dense Architectural Maquette Grid covering the Mountain View Urban Fabric
    for (let gx = -38.0; gx <= 38.0; gx += 3.85) {
      for (let gz = -38.0; gz <= 56.0; gz += 3.85) {
        let x = gx + (rand() - 0.5) * 0.28;
        let z = gz + (rand() - 0.5) * 0.28;
        const info = classifyDistrict(x, z);
        const isResidential = info.district === 'RES_SF';
        let w = 3.25;
        let d = 3.25;
        if (isInsideExclusionZone(x, z, w * 0.52, d * 0.52)) continue;
        const origHeight = isResidential ? 0.65 + rand() * 0.35 : 1.35 + rand() * 1.15;
        const mat = new THREE.MeshStandardMaterial({
          color: isResidential ? 0xeceae3 : 0xf3f0e8,
          emissive: 0x10161e,
          emissiveIntensity: 0.025,
          roughness: 0.40,
          metalness: 0.08
        });
        const mesh = new THREE.Group();
        mesh.position.set(x, 0, z);
        mesh.scale.set(1, origHeight, 1);
        const main = new THREE.Mesh(unitBoxGeo, mat);
        main.scale.set(w * 0.88, 1.0, d * 0.88);
        main.castShadow = true;
        main.receiveShadow = true;
        mesh.add(main);
        parcelsGroup.add(mesh);
        registerParcelRecord(x, z, w, d, origHeight, info, false, mat, mesh);
      }
    }
  }
}

generateCityParcels();
parcelsGroup.updateMatrixWorld(true);

// Selection Wireframe Beacon for Clicked Parcel
const selectionBeaconGeo = new THREE.BoxGeometry(1.06, 1.04, 1.06);
selectionBeaconGeo.translate(0, 0.5, 0);
const selectionBeaconMat = new THREE.MeshBasicMaterial({
  color: 0x48ecff,
  wireframe: true,
  transparent: true,
  opacity: 0.9
});
const selectionBeacon = new THREE.Mesh(selectionBeaconGeo, selectionBeaconMat);
selectionBeacon.visible = false;
cityRoot.add(selectionBeacon);

// ============================================================================
// 6. 3D PROJECTED LANDMARK CALLOUT PINS & SVG LEADER LINES (TRUE GEOTOSCENE)
// ============================================================================
const LANDMARK_CALLOUTS = [
  {
    id: 'call-bayview',
    title: 'GOOGLE BAY VIEW CANOPY',
    sub: 'NORTH BAYSHORE',
    subColor: 'rgba(236, 232, 223, 0.82)',
    styleType: 'top-left',
    worldPos: new THREE.Vector3(6.8, 2.2, -31.0),
    offsetX: -225,
    offsetY: -12,
    camKey: 'bayshore'
  },
  {
    id: 'call-shoreline',
    title: 'SHORELINE AMPHITHEATRE',
    sub: 'BAYFRONT',
    subColor: 'rgba(236, 232, 223, 0.82)',
    styleType: 'top-left',
    worldPos: new THREE.Vector3(-2.8, 3.2, -36.5),
    offsetX: -265,
    offsetY: -78,
    camKey: 'bayshore'
  },
  {
    id: 'call-hangar',
    title: 'NASA AMES HANGAR ONE',
    sub: 'MOFFETT AIRFIELD',
    subColor: 'rgba(236, 232, 223, 0.82)',
    styleType: 'top-right',
    worldPos: new THREE.Vector3(30.5, 3.8, -22.5),
    offsetX: 28,
    offsetY: -48,
    camKey: 'moffett'
  },
  {
    id: 'call-caltrain',
    title: 'CALTRAIN CORRIDOR',
    sub: '(CYAN)',
    subColor: '#48ecff',
    styleType: 'bottom-left',
    worldPos: new THREE.Vector3(-26.6, 0.4, -8.0),
    verticalDropVh: 0.78,
    camKey: 'sanantonio'
  },
  {
    id: 'call-creek',
    title: 'STEVENS CREEK TRAIL',
    sub: '(EMERALD)',
    subColor: '#46e094',
    styleType: 'bottom-right',
    worldPos: new THREE.Vector3(12.3, 0.4, 33.1),
    verticalDropVh: 0.89,
    camKey: 'overview'
  },
  {
    id: 'call-castro',
    title: 'CASTRO ST. PROMENADE',
    sub: '(AMBER)',
    subColor: '#f2ae49',
    styleType: 'bottom-left',
    worldPos: new THREE.Vector3(0.6, 0.4, 13.2),
    verticalDropVh: 0.86,
    camKey: 'castro'
  }
];

const calloutSvg = document.getElementById('callout-svg');
const calloutPinsContainer = document.getElementById('callout-pins');
let pinsVisible = true;

// Water Surface Label ("SF BAY WETLANDS")
const bayLabelEl = document.createElement('div');
bayLabelEl.className = 'water-label';
bayLabelEl.textContent = 'SF BAY WETLANDS';
calloutPinsContainer.appendChild(bayLabelEl);
const bayWaterWorldPos = new THREE.Vector3(-28.0, 0.4, -58.0);

const calloutDomElements = LANDMARK_CALLOUTS.map((item) => {
  const el = document.createElement('div');
  el.className = `landmark-callout callout-${item.styleType}`;
  el.id = item.id;
  el.innerHTML = `
    <div class="callout-title">${item.title}</div>
    <div class="callout-sub" style="color: ${item.subColor}">${item.sub}</div>
  `;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    flyToCameraPreset(item.camKey);
  });
  calloutPinsContainer.appendChild(el);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'rgba(236, 232, 223, 0.68)');
  line.setAttribute('stroke-width', '1.05');
  calloutSvg.appendChild(line);

  return { item, el, line };
});

function updateCalloutProjections() {
  if (!pinsVisible || window.innerWidth <= 960) {
    calloutSvg.style.display = 'none';
    calloutPinsContainer.style.display = 'none';
    return;
  }
  calloutSvg.style.display = 'block';
  calloutPinsContainer.style.display = 'block';

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Project SF Bay Wetlands label
  const bayProj = bayWaterWorldPos.clone().project(camera);
  const bx = (bayProj.x * 0.5 + 0.5) * w;
  const by = (-bayProj.y * 0.5 + 0.5) * h;
  if (bayProj.z < 1 && bx > 240 && bx < w - 240 && by > 65 && by < h - 180) {
    bayLabelEl.style.left = `${bx}px`;
    bayLabelEl.style.top = `${by}px`;
    bayLabelEl.style.display = 'block';
  } else {
    bayLabelEl.style.display = 'none';
  }

  calloutDomElements.forEach(({ item, el, line }) => {
    const proj = item.worldPos.clone().project(camera);
    const sx = (proj.x * 0.5 + 0.5) * w;
    const sy = (-proj.y * 0.5 + 0.5) * h;
    if (proj.z > 1 || sx < 235 || sx > w - 235 || sy < 55 || sy > h - 55) {
      el.style.display = 'none';
      line.style.display = 'none';
      return;
    }

    if (item.styleType === 'top-left') {
      const lx = Math.max(235, Math.min(w - 280, sx + (item.offsetX || -245)));
      const ly = Math.max(68, sy + (item.offsetY || -64));
      if (ly > h - 190) {
        el.style.display = 'none';
        line.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      line.style.display = 'block';
      el.style.left = `${lx}px`;
      el.style.top = `${ly}px`;
      const textWidth = el.offsetWidth || 195;
      const elbowX = lx + textWidth + 8;
      const elbowY = ly;
      line.setAttribute(
        'points',
        `${lx.toFixed(1)},${elbowY.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${sx.toFixed(1)},${sy.toFixed(1)}`
      );
    } else if (item.styleType === 'top-right') {
      const lx = Math.max(235, Math.min(w - 430, sx + (item.offsetX || 34)));
      const ly = Math.max(68, sy + (item.offsetY || -50));
      if (ly > h - 190) {
        el.style.display = 'none';
        line.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      line.style.display = 'block';
      el.style.left = `${lx}px`;
      el.style.top = `${ly}px`;
      const textWidth = el.offsetWidth || 195;
      const elbowX = lx - 10;
      const elbowY = ly;
      const rightEnd = lx + textWidth;
      line.setAttribute(
        'points',
        `${rightEnd.toFixed(1)},${elbowY.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${sx.toFixed(1)},${sy.toFixed(1)}`
      );
    } else if (item.styleType === 'bottom-left' || item.styleType === 'bottom-right') {
      const bottomY = Math.max(sy + 48, Math.min(h - 34, h * item.verticalDropVh));
      if (sx < 265 || sx > w - 265) {
        el.style.display = 'none';
        line.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      line.style.display = 'block';
      el.style.left = `${sx}px`;
      el.style.top = `${bottomY}px`;
      line.setAttribute(
        'points',
        `${sx.toFixed(1)},${sy.toFixed(1)} ${sx.toFixed(1)},${bottomY.toFixed(1)}`
      );
    }
  });
}

// ============================================================================
// 7. INITIALIZE PIPELINE, ENGINES, GEMINI BRIDGE & UI BINDINGS
// ============================================================================
const audioEngine = new TwinAudioEngine();
const simEngines = new SimulationEngines();
const telemetryPipeline = new TelemetryPipeline();

let activeGisLayer = 'massing';
let selectedParcel = parcelRecords.find((p) => p.district === 'DT_CRA') || parcelRecords[0];
let isAutoOrbit = false;

// Camera Flight Presets (True geoToScene Coordinates Across All 6 Mountain View Districts)
const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(-126.0, 138.0, 136.0),
    target: new THREE.Vector3(0.0, -4.0, 2.0),
    label: '360° ISOMETRIC ORBITAL VIEW'
  },
  bayshore: {
    pos: new THREE.Vector3(-42, 36, 4),
    target: new THREE.Vector3(2, 1, -33),
    label: 'NORTH BAYSHORE // BAY VIEW & SHORELINE'
  },
  castro: {
    pos: new THREE.Vector3(-42, 34, 52),
    target: new THREE.Vector3(2, 1, 10),
    label: 'DOWNTOWN CASTRO & CALTRAIN TRANSIT HUB'
  },
  sanantonio: {
    pos: new THREE.Vector3(-76, 34, 28),
    target: new THREE.Vector3(-31, 1, -8),
    label: 'SAN ANTONIO // CALTRAIN STATION & TOD CENTER'
  },
  moffett: {
    pos: new THREE.Vector3(-12, 38, 22),
    target: new THREE.Vector3(28, 2, -20),
    label: 'MOFFETT AIRFIELD & NASA AMES HANGAR ONE'
  },
  southmv: {
    pos: new THREE.Vector3(-48, 42, 88),
    target: new THREE.Vector3(2, 1, 36),
    label: 'SOUTH MOUNTAIN VIEW // CUESTA PARK & SR-85'
  }
};

let camFlight = null;

function flyToCameraPreset(key) {
  const preset = CAMERA_PRESETS[key] || CAMERA_PRESETS.overview;
  selectionBeacon.visible = false;
  camFlight = {
    startPos: camera.position.clone(),
    endPos: preset.pos.clone(),
    startTarget: controls.target.clone(),
    endTarget: preset.target.clone(),
    progress: 0
  };
  const labelEl = document.getElementById('view-mode-label');
  if (labelEl) labelEl.textContent = preset.label;

  document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === key);
  });
  audioEngine.playTelemetryChime(659.25);
}

// Update 3D Parcel Colors for Active GIS Overlay Layer
function applyGisOverlayColors() {
  const snapshot = telemetryPipeline.getSnapshot();
  const vc101 = snapshot ? snapshot.corridors.us101.vc : 0.88;

  if (activeGisLayer === 'traffic') {
    const colHex = vc101 >= 0.82 ? 0xff5252 : vc101 >= 0.56 ? 0xffb84d : 0x48ecff;
    us101Main.mat.color.setHex(colHex).multiplyScalar(1.45);
  } else {
    us101Main.mat.color.setHex(0x8efaff).multiplyScalar(1.62);
  }

  const surgeM = simEngines.params.baySurge;
  if (activeGisLayer === 'flood' || surgeM > 0.05) {
    const effectiveSurge = activeGisLayer === 'flood' ? Math.max(0.8, surgeM) : surgeM;
    surgeWaterMat.opacity = Math.min(0.62, 0.18 + effectiveSurge * 0.22);
    surgeWaterMesh.position.y = -0.12 + effectiveSurge * 0.34;
    surgeWaterMesh.visible = true;
  } else {
    surgeWaterMat.opacity = 0.0;
    surgeWaterMesh.position.y = -0.14;
    surgeWaterMesh.visible = false;
  }

  for (const p of parcelRecords) {
    if (p.currentZoneKey === 'PARK') {
      p.mat.color.setHex(0x28a86b);
      p.mat.emissive.setHex(0x0d472b);
      p.mat.emissiveIntensity = 0.35;
      continue;
    }

    if (activeGisLayer === 'massing') {
      const isUpzoned = simEngines.parcelOverrides.has(p.id);
      p.mat.color.setHex(isUpzoned ? 0xfff6e0 : p.baseColorHex);
      p.mat.emissive.setHex(isUpzoned ? 0x48ecff : p.baseEmissiveHex);
      p.mat.emissiveIntensity = isUpzoned ? 0.32 : p.baseEmissiveIntensity;
    } else if (activeGisLayer === 'traffic') {
      const tripIntensity = Math.min(1, (p.units + p.jobs) / 480);
      const col = new THREE.Color().setHSL(0.48 - tripIntensity * 0.46, 0.85, 0.54);
      p.mat.color.copy(col);
      p.mat.emissive.copy(col);
      p.mat.emissiveIntensity = 0.28;
    } else if (activeGisLayer === 'thermal') {
      const heatNorm = Math.max(0, Math.min(1, (p.heatDelta + 1.0) / 3.2));
      const col = new THREE.Color().setHSL(0.42 - heatNorm * 0.39, 0.88, 0.52);
      p.mat.color.copy(col);
      p.mat.emissive.copy(col);
      p.mat.emissiveIntensity = 0.3;
    } else if (activeGisLayer === 'flood') {
      const risk = p.z < -12 ? Math.min(1, (Math.max(0.8, surgeM) - p.elevationThreshold + 0.5) / 1.2) : 0.08;
      const col = risk > 0.35 ? new THREE.Color(0x2bc4ff) : new THREE.Color(0x8899a8);
      p.mat.color.copy(col);
      p.mat.emissive.setHex(risk > 0.35 ? 0x0088cc : 0x101820);
      p.mat.emissiveIntensity = risk > 0.35 ? 0.45 : 0.08;
    }
  }

  for (const distMesh of staticBuildingsGroup.children) {
    const dKey = distMesh.userData.district;
    const mat = distMesh.material;
    if (!mat) continue;
    if (activeGisLayer === 'massing') {
      mat.color.setHex(distMesh.userData.baseColorHex || 0xe4e1d8);
      mat.emissive.setHex(dKey === 'DT_CRA' ? 0x382008 : 0x10161e);
      mat.emissiveIntensity = dKey === 'DT_CRA' ? 0.12 : 0.025;
    } else if (activeGisLayer === 'traffic') {
      const isHighTrip = dKey === 'DT_CRA' || dKey === 'ECR_MU' || dKey === 'NB_PP';
      mat.color.setHex(isHighTrip ? 0xf2b468 : 0x76d4dc);
      mat.emissive.setHex(isHighTrip ? 0x5c3208 : 0x0c343c);
      mat.emissiveIntensity = 0.22;
    } else if (activeGisLayer === 'thermal') {
      const isCool = simEngines.params.canopyMandate >= 24 || dKey === 'RES_SF';
      mat.color.setHex(isCool ? 0x62d898 : 0xf29c52);
      mat.emissive.setHex(isCool ? 0x0c3c22 : 0x542206);
      mat.emissiveIntensity = 0.22;
    } else if (activeGisLayer === 'flood') {
      const isFloodZone = dKey === 'NB_PP';
      mat.color.setHex(isFloodZone ? 0x2bc4ff : 0x8899a8);
      mat.emissive.setHex(isFloodZone ? 0x006699 : 0x101820);
      mat.emissiveIntensity = isFloodZone ? 0.36 : 0.06;
    }
  }
}

function updateInspectorUI(parcel) {
  if (!parcel) return;
  selectedParcel = parcel;
  selectionBeacon.visible = true;
  selectionBeacon.position.set(parcel.x, 0, parcel.z);
  selectionBeacon.scale.set(parcel.w * 1.08, parcel.targetHeight * 1.04, parcel.d * 1.08);

  const idEl = document.getElementById('parcel-id-label');
  const badgeEl = document.getElementById('parcel-zone-badge');
  const descEl = document.getElementById('parcel-desc-label');
  const statsEl = document.getElementById('parcel-stats-label');

  const bName = parcel.name ? ` (${parcel.name.toUpperCase()})` : '';
  if (idEl) idEl.textContent = `PARCEL: ${parcel.id}${bName}`;
  if (badgeEl) badgeEl.textContent = parcel.currentZoneCode;
  const lat = parcel.lat !== undefined ? parcel.lat : (sceneToGeo(parcel.x, parcel.z).lat);
  const lon = parcel.lon !== undefined ? parcel.lon : (sceneToGeo(parcel.x, parcel.z).lon);
  const areaSqm = parcel.areaSqm || Math.round(parcel.w * parcel.d * 180);
  const areaSqFt = Math.round(areaSqm * 10.7639);
  if (descEl) {
    descEl.textContent = `${parcel.districtName} · Lat/Lon: ${lat.toFixed(5)}, ${lon.toFixed(5)} · Area: ${areaSqm.toLocaleString()} m² (${areaSqFt.toLocaleString()} sq ft)`;
  }
  const stories = parcel.levels || Math.max(1, Math.round(parcel.targetHeight * 1.8));
  const heightM = parcel.heightM || +(parcel.targetHeight * 4.2).toFixed(1);
  const heightFt = Math.round(heightM * 3.28084);
  if (statsEl) {
    statsEl.textContent = `FAR ${parcel.targetFar} · ${stories} Stories (${heightM}m / ${heightFt}ft) · ${parcel.units} Units · ${parcel.jobs} Jobs · ${ZONE_DEFS[parcel.currentZoneKey].label}`;
  }

  document.querySelectorAll('[data-rezone]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rezone === parcel.currentZoneKey);
  });
}

// Subscribe DOM Telemetry Readouts to Layer 3 TelemetryPipeline
telemetryPipeline.subscribe((snap) => {
  const los101El = document.getElementById('los-101');
  const losEcrEl = document.getElementById('los-ecr');
  if (los101El) {
    los101El.textContent = snap.corridors.us101.label;
    los101El.className = snap.corridors.us101.cls;
  }
  if (losEcrEl) {
    losEcrEl.textContent = snap.corridors.ecr.label;
    losEcrEl.className = snap.corridors.ecr.cls;
  }

  const caltrainEl = document.getElementById('metric-caltrain');
  if (caltrainEl) {
    caltrainEl.textContent = `${snap.caltrainHeadway} min · ${snap.caltrainBoardingsK}k/d`;
  }

  const modeShareEl = document.getElementById('metric-mode-share');
  if (modeShareEl) {
    modeShareEl.textContent = `${snap.transitShare.toFixed(1)}%`;
  }

  const climateEl = document.getElementById('metric-climate');
  if (climateEl) {
    const sign = snap.uhiDelta > 0 ? '+' : '';
    climateEl.textContent = `${sign}${snap.uhiDelta}°C · ${snap.baySurge.toFixed(1)}m`;
  }

  const greenEl = document.getElementById('metric-greenspace');
  if (greenEl) {
    greenEl.textContent = snap.greenspacePct.toFixed(1);
  }
  const deltaGreenEl = document.getElementById('delta-greenspace');
  if (deltaGreenEl) {
    const diff = +(snap.greenspacePct - 16.4).toFixed(1);
    deltaGreenEl.textContent = diff === 0 ? 'BASELINE' : `${diff > 0 ? '+' : ''}${diff}% CANOPY`;
  }
  const solarSubEl = document.getElementById('metric-solar-sub');
  if (solarSubEl) {
    solarSubEl.textContent = `SOLAR PV: ${snap.solarMw} MW · RUNOFF CAPTURE: ${snap.runoffCapturePct}%`;
  }

  const popEl = document.getElementById('metric-population');
  if (popEl) {
    popEl.textContent = snap.population.toLocaleString();
  }
  const deltaPopEl = document.getElementById('delta-population');
  if (deltaPopEl) {
    const rhnaPct = ((Math.max(0, snap.rhnaDelta) / 11135) * 100).toFixed(1);
    deltaPopEl.textContent = `RHNA ${snap.rhnaDelta >= 0 ? '+' : ''}${snap.rhnaDelta.toLocaleString()} / 11,135 (${rhnaPct}%)`;
  }
  const housingSubEl = document.getElementById('metric-housing-sub');
  if (housingSubEl) {
    housingSubEl.textContent = `${snap.housingUnits.toLocaleString()} UNITS · JOBS/HOUSING ${snap.jobsHousingRatio}:1`;
  }
});

function runSimulationCycle(reason = 'update') {
  const snapshot = simEngines.evaluateState(parcelRecords);
  telemetryPipeline.publish(snapshot, reason);
  applyGisOverlayColors();
  updateInspectorUI(selectedParcel);

  // Astronomical Solar Physics Lighting
  const solar = simEngines.computeSolarPhysics();
  const R = 160;
  keyLight.position.set(solar.sunVector[0] * R, Math.max(30, solar.sunVector[1] * R), solar.sunVector[2] * R);

  return snapshot;
}

const geminiBridge = new GeminiUrbanBridge(simEngines, runSimulationCycle, () => parcelRecords);

// Initial Baseline Evaluation
runSimulationCycle('init');
selectionBeacon.visible = false;
telemetryPipeline.initLiveFeeds(simEngines, runSimulationCycle);

// ============================================================================
// 8. UI EVENT LISTENERS (SCENARIOS, SLIDERS, RAYCASTING, GEMINI PROMPT)
// ============================================================================
function syncSlidersFromSim() {
  const sFar = document.getElementById('slider-far');
  const sTransit = document.getElementById('slider-transit');
  const sCanopy = document.getElementById('slider-canopy');
  const sSurge = document.getElementById('slider-surge');

  if (sFar) sFar.value = simEngines.params.farCap;
  if (sTransit) sTransit.value = simEngines.params.transitShare;
  if (sCanopy) sCanopy.value = Math.round(simEngines.params.canopyMandate);
  if (sSurge) sSurge.value = simEngines.params.baySurge;

  document.getElementById('val-far').textContent = `${simEngines.params.farCap.toFixed(1)}x`;
  document.getElementById('val-transit').textContent = `${Math.round(simEngines.params.transitShare)}%`;
  document.getElementById('val-canopy').textContent = `${Math.round(simEngines.params.canopyMandate)}%`;
  document.getElementById('val-surge').textContent = `${simEngines.params.baySurge.toFixed(1)}m`;
}

function activateScenarioPreset(scenarioKey) {
  const preset = SCENARIO_PRESETS[scenarioKey];
  if (!preset) return;

  simEngines.activeScenarioId = preset.id;
  simEngines.params.farCap = preset.farCap;
  simEngines.params.transitShare = preset.transitShare;
  simEngines.params.canopyMandate = preset.canopyMandate;
  simEngines.params.baySurge = preset.baySurge;
  simEngines.districtMultipliers = { ...preset.districtMultipliers };
  simEngines.parcelOverrides.clear();

  syncSlidersFromSim();
  const snap = runSimulationCycle(`scenario:${scenarioKey}`);

  document.querySelectorAll('[data-scenario]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scenario === scenarioKey);
  });

  const synthEl = document.getElementById('gemini-synthesis-text');
  if (synthEl) {
    synthEl.textContent = preset.summary;
  }

  audioEngine.playTelemetryChime(523.25);
  return snap;
}

document.querySelectorAll('[data-scenario]').forEach((btn) => {
  btn.addEventListener('click', () => {
    activateScenarioPreset(btn.dataset.scenario);
  });
});

document.querySelectorAll('[data-layer]').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeGisLayer = btn.dataset.layer;
    document.querySelectorAll('[data-layer]').forEach((b) => {
      b.classList.toggle('active', b.dataset.layer === activeGisLayer);
    });
    applyGisOverlayColors();
    audioEngine.playTelemetryChime(698.46);
  });
});

document.querySelectorAll('[data-cam]').forEach((btn) => {
  btn.addEventListener('click', () => {
    flyToCameraPreset(btn.dataset.cam);
  });
});

['slider-far', 'slider-transit', 'slider-canopy', 'slider-surge'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    simEngines.activeScenarioId = 'custom';
    simEngines.params.farCap = parseFloat(document.getElementById('slider-far').value);
    simEngines.params.transitShare = parseFloat(document.getElementById('slider-transit').value);
    simEngines.params.canopyMandate = parseFloat(document.getElementById('slider-canopy').value);
    simEngines.params.baySurge = parseFloat(document.getElementById('slider-surge').value);
    syncSlidersFromSim();
    document.querySelectorAll('[data-scenario]').forEach((b) => b.classList.remove('active'));
    runSimulationCycle('slider');
  });
});

document.querySelectorAll('[data-rezone]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!selectedParcel) return;
    const zoneKey = btn.dataset.rezone;
    simEngines.parcelOverrides.set(selectedParcel.id, zoneKey);
    const snap = runSimulationCycle(`rezone:${selectedParcel.id}:${zoneKey}`);
    const synthEl = document.getElementById('gemini-synthesis-text');
    if (synthEl) {
      synthEl.textContent = `[L1 PostGIS Parcel → L2 Three.js → L3 TimescaleDB → L4 SUMO/WebGPU] Parcel ${selectedParcel.id} (${selectedParcel.districtName}) rezoned to ${ZONE_DEFS[zoneKey].code} → ${selectedParcel.units} housing units, ${selectedParcel.jobs} jobs. City total: ${snap.housingUnits.toLocaleString()} units.`;
    }
    audioEngine.playTelemetryChime(783.99);
  });
});

// Sim Controls Drawer Toggle (via #btn-drawer-toggle, corner cards, or top title cluster)
const simDrawer = document.getElementById('sim-drawer');
const btnDrawerToggle = document.getElementById('btn-drawer-toggle');

function toggleSimDrawer() {
  if (!simDrawer) return;
  simDrawer.classList.toggle('collapsed');
}

if (btnDrawerToggle && simDrawer) {
  btnDrawerToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSimDrawer();
  });
}

['telemetry-left-card', 'telemetry-right-card', 'header-title-trigger'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', () => {
      toggleSimDrawer();
    });
  }
});

const headerCoordTrigger = document.getElementById('header-coord-trigger');
if (headerCoordTrigger) {
  headerCoordTrigger.addEventListener('click', () => {
    flyToCameraPreset('overview');
  });
}

// 360° Auto-Orbit, Pins, and Audio Toggles
const btnOrbitToggle = document.getElementById('btn-orbit-toggle');
if (btnOrbitToggle) {
  btnOrbitToggle.addEventListener('click', () => {
    isAutoOrbit = !isAutoOrbit;
    btnOrbitToggle.classList.toggle('active', isAutoOrbit);
  });
}

const btnPinsToggle = document.getElementById('btn-pins-toggle');
if (btnPinsToggle) {
  btnPinsToggle.addEventListener('click', () => {
    pinsVisible = !pinsVisible;
    btnPinsToggle.textContent = pinsVisible ? 'Pins: On' : 'Pins: Off';
    btnPinsToggle.classList.toggle('active', pinsVisible);
  });
}

const btnAudioToggle = document.getElementById('btn-audio-toggle');
if (btnAudioToggle) {
  btnAudioToggle.addEventListener('click', () => {
    const playing = audioEngine.toggle();
    btnAudioToggle.classList.toggle('active', playing);
    btnAudioToggle.textContent = playing ? '♪ Playing' : '♪ Audio';
  });
}

// Google Photorealistic 3D Tiles Settings Drawer Handlers
const tilesDrawer = document.getElementById('tiles-settings-card');
const btnTilesToggle = document.getElementById('btn-tiles-toggle');
const btnCloseTiles = document.getElementById('btn-close-tiles-settings');
const btnSaveTilesKey = document.getElementById('btn-save-tiles-key');
const btnClearTilesKey = document.getElementById('btn-clear-tiles-key');
const tilesKeyInput = document.getElementById('tiles-key-input');
const tilesStatusLabel = document.getElementById('tiles-status-label');

function updateTilesStatus() {
  const key = localStorage.getItem('bevelez_3dtiles_api_key');
  if (tilesKeyInput && !tilesKeyInput.value && key) {
    tilesKeyInput.value = key;
  }
  if (tilesStatusLabel) {
    if (key) {
      tilesStatusLabel.textContent = 'Status: Google 3D Tiles Configured (Photorealistic 3D Tiles Ready)';
      tilesStatusLabel.style.color = '#54e098';
    } else {
      tilesStatusLabel.textContent = 'Status: Vector GIS Active (Zero keys required — 100% functional)';
      tilesStatusLabel.style.color = 'rgba(226, 230, 236, 0.72)';
    }
  }
  if (btnTilesToggle) {
    btnTilesToggle.classList.toggle('active', Boolean(key));
  }
}
updateTilesStatus();

if (btnTilesToggle && tilesDrawer) {
  btnTilesToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    tilesDrawer.classList.toggle('collapsed');
  });
}
if (btnCloseTiles && tilesDrawer) {
  btnCloseTiles.addEventListener('click', () => {
    tilesDrawer.classList.add('collapsed');
  });
}
if (btnSaveTilesKey) {
  btnSaveTilesKey.addEventListener('click', () => {
    const val = tilesKeyInput ? tilesKeyInput.value.trim() : '';
    if (val) {
      localStorage.setItem('bevelez_3dtiles_api_key', val);
    } else {
      localStorage.removeItem('bevelez_3dtiles_api_key');
    }
    updateTilesStatus();
  });
}
if (btnClearTilesKey) {
  btnClearTilesKey.addEventListener('click', () => {
    localStorage.removeItem('bevelez_3dtiles_api_key');
    if (tilesKeyInput) tilesKeyInput.value = '';
    updateTilesStatus();
  });
}

// Optional Gemini 2.5 Flash API Key Management
const geminiDrawer = document.getElementById('gemini-settings-card');
const btnGeminiToggle = document.getElementById('btn-gemini-toggle');
const btnCloseGemini = document.getElementById('btn-close-gemini-settings');
const geminiKeyInput = document.getElementById('gemini-key-input');
const btnSaveGeminiKey = document.getElementById('btn-save-gemini-key');
const btnClearGeminiKey = document.getElementById('btn-clear-gemini-key');
const geminiStatusLabel = document.getElementById('gemini-status-label');

function updateGeminiKeyStatus() {
  const savedKey = localStorage.getItem('bevelez_gemini_api_key');
  if (savedKey) {
    if (geminiStatusLabel) {
      geminiStatusLabel.textContent = `Status: [GEMINI 2.5 FLASH (LIVE API)] Active (${savedKey.slice(0, 6)}...${savedKey.slice(-4)})`;
      geminiStatusLabel.style.color = 'var(--emerald)';
    }
    if (geminiKeyInput) geminiKeyInput.value = savedKey;
  } else {
    if (geminiStatusLabel) {
      geminiStatusLabel.textContent = 'Status: [LOCAL NL-TO-GIS COMPILER] Active (Zero keys required)';
      geminiStatusLabel.style.color = '';
    }
    if (geminiKeyInput) geminiKeyInput.value = '';
  }
}
updateGeminiKeyStatus();

if (btnGeminiToggle && geminiDrawer) {
  btnGeminiToggle.addEventListener('click', () => {
    geminiDrawer.classList.toggle('collapsed');
    updateGeminiKeyStatus();
  });
}
if (btnCloseGemini && geminiDrawer) {
  btnCloseGemini.addEventListener('click', () => {
    geminiDrawer.classList.add('collapsed');
  });
}
if (btnSaveGeminiKey) {
  btnSaveGeminiKey.addEventListener('click', () => {
    const val = geminiKeyInput ? geminiKeyInput.value.trim() : '';
    if (val) {
      localStorage.setItem('bevelez_gemini_api_key', val);
    } else {
      localStorage.removeItem('bevelez_gemini_api_key');
    }
    updateGeminiKeyStatus();
  });
}
if (btnClearGeminiKey) {
  btnClearGeminiKey.addEventListener('click', () => {
    localStorage.removeItem('bevelez_gemini_api_key');
    updateGeminiKeyStatus();
  });
}

// Gemini Natural Language Form Submission
const geminiForm = document.getElementById('gemini-form');
const geminiInput = document.getElementById('gemini-prompt-input');
if (geminiForm && geminiInput) {
  geminiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = geminiInput.value.trim() || 'Upzone El Camino Real to 6 stories with BRT and +30% solar canopy';
    simDrawer.classList.remove('collapsed');

    const synthEl = document.getElementById('gemini-synthesis-text');
    if (synthEl) synthEl.textContent = `Simulating "${query}" across ${parcelRecords.length} Mountain View GIS parcels...`;

    const resultText = await geminiBridge.executePrompt(query);
    syncSlidersFromSim();
    if (synthEl && resultText) {
      synthEl.textContent = resultText;
    }
    audioEngine.playTelemetryChime(880.0);
  });
}

// 3D Raycasting for Parcel Inspection & Live Cursor GIS Coordinates
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();
let pointerDownPos = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons > 0 && Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) {
    camFlight = null;
  }
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(groundPlane, planeIntersect)) {
    const { lat, lon } = worldToLatLon(planeIntersect.x, planeIntersect.z);
    const coordEl = document.getElementById('cursor-coords');
    if (coordEl) {
      coordEl.textContent = `[LAT: ${lat.toFixed(2)}N, LON: ${Math.abs(lon).toFixed(2)}W]`;
    }
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (dragDist > 6) return;

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects([...interactableMeshes, ...staticBuildingsGroup.children], false);
  if (hits.length > 0) {
    let clickedParcel = hits[0].object.userData.parcel;
    if (!clickedParcel && parcelRecords.length > 0) {
      const hitPt = hits[0].point;
      let bestDistSq = Infinity;
      for (const p of parcelRecords) {
        const dSq = (p.x - hitPt.x) * (p.x - hitPt.x) + (p.z - hitPt.z) * (p.z - hitPt.z);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          clickedParcel = p;
        }
      }
    }
    if (clickedParcel) {
      simDrawer.classList.remove('collapsed');
      updateInspectorUI(clickedParcel);
      audioEngine.playTelemetryChime(659.25);
    }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// 9. 60FPS CONTINUOUS ANIMATION LOOP & PUBLIC API EXPOSURE
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (camFlight) {
    camFlight.progress = Math.min(1, camFlight.progress + dt * 2.2);
    const ease = 1 - Math.pow(1 - camFlight.progress, 3);
    camera.position.lerpVectors(camFlight.startPos, camFlight.endPos, ease);
    controls.target.lerpVectors(camFlight.startTarget, camFlight.endTarget, ease);
    if (camFlight.progress >= 1) camFlight = null;
  } else if (isAutoOrbit) {
    const angle = dt * 0.28;
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    camera.position.copy(controls.target).add(offset);
  }

  controls.update();

  for (const p of parcelRecords) {
    if (Math.abs(p.currentHeight - p.targetHeight) > 0.004) {
      p.currentHeight = THREE.MathUtils.lerp(p.currentHeight, p.targetHeight, dt * 7.5);
      p.mesh.scale.y = p.currentHeight;
    }
  }
  const farFactor = simEngines.params.farCap / 2.4;
  for (const distMesh of staticBuildingsGroup.children) {
    const dKey = distMesh.userData.district;
    const distMult = simEngines.districtMultipliers[dKey] || 1.0;
    const targetScaleY = dKey === 'RES_SF'
      ? Math.max(0.85, 1.0 + (distMult - 1.0) * 0.65)
      : Math.max(0.55, distMult * (0.65 + 0.35 * farFactor));
    const currScaleY = distMesh.userData.currentScaleY || 1.0;
    if (Math.abs(currScaleY - targetScaleY) > 0.003) {
      distMesh.userData.currentScaleY = THREE.MathUtils.lerp(currScaleY, targetScaleY, dt * 6.5);
      distMesh.scale.y = distMesh.userData.currentScaleY;
    }
  }
  if (selectionBeacon.visible && selectedParcel) {
    selectionBeacon.scale.y = selectedParcel.currentHeight * 1.04;
  }

  const snap = telemetryPipeline.getSnapshot();
  const speed101 = snap ? snap.corridors.us101.speedFactor : 0.6;
  const speedEcr = snap ? snap.corridors.ecr.speedFactor : 0.85;

  for (const agent of trafficAgents) {
    const mult = agent.is101 ? speed101 : speedEcr;
    agent.t = (agent.t + agent.dir * agent.baseSpeed * mult * dt + 1) % 1;
    const pt = agent.curve.getPointAt(agent.t);
    const tangent = agent.curve.getTangentAt(agent.t).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    agent.mesh.position.set(
      pt.x + normalX * agent.laneOffset,
      0.22,
      pt.z + normalZ * agent.laneOffset
    );
    agent.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  }

  const trainFreqBoost = 1 + (simEngines.params.transitShare - 25) * 0.015;
  for (const train of caltrainTrains) {
    train.t = (train.t + train.dir * 0.085 * trainFreqBoost * dt + 1) % 1;
    const pt = caltrainMain.curve.getPointAt(train.t);
    const tangent = caltrainMain.curve.getTangentAt(train.t).normalize();
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    train.mesh.position.set(
      pt.x + normalX * train.laneShift,
      0.36,
      pt.z + normalZ * train.laneShift
    );
    train.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  }

  updateCalloutProjections();
  composer.render();
}

animate();

// Automated 3D Bounding-Box, Self-Intersection & Corridor Clearance Verification Helper
function checkCorridorClearance() {
  landmarksGroup.updateMatrixWorld(true);
  parcelsGroup.updateMatrixWorld(true);

  const landmarkViolations = [];
  const landmarkSiblingViolations = [];
  const parcelViolations = [];
  let minLandmarkClearance101 = Infinity;
  let minLandmarkClearanceCaltrain = Infinity;
  let minLandmarkClearanceEcr = Infinity;
  let minParcelClearance101 = Infinity;
  let minParcelClearanceCaltrain = Infinity;
  let minParcelClearanceEcr = Infinity;
  let totalLandmarkMeshes = 0;

  landmarksGroup.children.forEach((landmarkGroup) => {
    landmarkGroup.traverse((child) => {
      if (!child.isMesh) return;
      totalLandmarkMeshes++;
      const box = new THREE.Box3().setFromObject(child);
      const d101 = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, us101Samples);
      const dCal = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, caltrainSamples);
      const dEcr = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, ecrSamples);

      if (d101 < minLandmarkClearance101) minLandmarkClearance101 = d101;
      if (dCal < minLandmarkClearanceCaltrain) minLandmarkClearanceCaltrain = dCal;
      if (dEcr < minLandmarkClearanceEcr) minLandmarkClearanceEcr = dEcr;

      if (d101 < 2.2 || dCal < 1.8 || dEcr < 1.8) {
        landmarkViolations.push({
          landmark: landmarkGroup.name,
          d101: +d101.toFixed(2),
          dCal: +dCal.toFixed(2),
          dEcr: +dEcr.toFixed(2)
        });
      }
    });
  });

  const bayViewCampus = landmarksGroup.children.find((g) => g.name === 'GoogleBayViewCampus');
  if (bayViewCampus) {
    const subModules = bayViewCampus.children.filter((c) => c.isGroup);
    const subBoxes = subModules.map((mod) => ({
      name: mod.name || 'sub',
      box: new THREE.Box3().setFromObject(mod)
    }));
    const minWorldGap = 0.5 * (bayViewCampus.scale.x || 1.0);
    for (let i = 0; i < subBoxes.length; i++) {
      for (let j = i + 1; j < subBoxes.length; j++) {
        const a = subBoxes[i].box;
        const b = subBoxes[j].box;
        const dx = Math.max(a.min.x - b.max.x, 0, b.min.x - a.max.x);
        const dz = Math.max(a.min.z - b.max.z, 0, b.min.z - a.max.z);
        const gap = Math.hypot(dx, dz);
        if (gap < minWorldGap - 0.01) {
          landmarkSiblingViolations.push({
            a: subBoxes[i].name,
            b: subBoxes[j].name,
            gap: +gap.toFixed(2)
          });
        }
      }
    }
  }

  for (const p of parcelRecords) {
    const box = new THREE.Box3().setFromObject(p.mesh);
    const d101 = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, us101Samples);
    const dCal = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, caltrainSamples);
    const dEcr = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, ecrSamples);
    const dCreek = minDistBoxToSamples(box.min.x, box.max.x, box.min.z, box.max.z, stevensCreekSamples);

    if (d101 < minParcelClearance101) minParcelClearance101 = d101;
    if (dCal < minParcelClearanceCaltrain) minParcelClearanceCaltrain = dCal;
    if (dEcr < minParcelClearanceEcr) minParcelClearanceEcr = dEcr;

    if (d101 < 2.2 || dCal < 1.5 || dEcr < 1.4 || dCreek < 1.6) {
      parcelViolations.push({
        id: p.id,
        d101: +d101.toFixed(2),
        dCal: +dCal.toFixed(2),
        dEcr: +dEcr.toFixed(2),
        dCreek: +dCreek.toFixed(2)
      });
    }
  }

  const corridorDepthWriteViolations = corridorsGroup.children.filter((m) => m.material && m.material.depthWrite !== false).length;
  const surgeOcclusionRisk =
    surgeWaterMat.depthWrite !== false ||
    (activeGisLayer !== 'flood' && simEngines.params.baySurge <= 0.05 && surgeWaterMesh.visible);

  return {
    totalLandmarkMeshes,
    totalParcelsChecked: parcelRecords.length,
    landmarkViolations,
    landmarkSiblingViolations,
    parcelViolations,
    corridorDepthWriteViolations,
    surgeOcclusionRisk,
    minLandmarkClearance101: +minLandmarkClearance101.toFixed(2),
    minLandmarkClearanceCaltrain: +minLandmarkClearanceCaltrain.toFixed(2),
    minLandmarkClearanceEcr: +minLandmarkClearanceEcr.toFixed(2),
    minParcelClearance101: +minParcelClearance101.toFixed(2),
    minParcelClearanceCaltrain: +minParcelClearanceCaltrain.toFixed(2),
    minParcelClearanceEcr: +minParcelClearanceEcr.toFixed(2)
  };
}

// Expose the 5-Layer Architecture Stack & Public API for Live Inspection & E2E Verification
window.MountainViewTwin = {
  architectureStack: ARCHITECTURE_STACK,
  layers: {
    layer1_gis: {
      ...ARCHITECTURE_STACK.layer1_gis,
      parcelCount: parcelRecords.length,
      landmarksCount: landmarksGroup.children.length
    },
    layer2_viewport: {
      ...ARCHITECTURE_STACK.layer2_viewport,
      getActiveLayer: () => activeGisLayer
    },
    layer3_ingestion: {
      ...ARCHITECTURE_STACK.layer3_ingestion,
      pipeline: telemetryPipeline
    },
    layer4_physics: {
      ...ARCHITECTURE_STACK.layer4_physics,
      engine: simEngines
    },
    layer5_orchestration: {
      ...ARCHITECTURE_STACK.layer5_orchestration,
      bridge: geminiBridge
    }
  },
  viewport: {
    scene,
    camera,
    renderer,
    controls,
    parcelRecords,
    interactableMeshes,
    landmarksGroup,
    districtLandmarksGroup,
    allLandmarks: [...landmarksGroup.children, ...districtLandmarksGroup.children],
    CAMERA_PRESETS,
    mvGisData,
    geoToScene,
    sceneToGeo,
    corridors: {
      us101: us101Samples,
      caltrain: caltrainSamples,
      ecr: ecrSamples,
      castro: castroSamples
    },
    checkCorridorClearance,
    flyToCameraPreset,
    getActiveLayer: () => activeGisLayer,
    setActiveLayer: (layer) => {
      const btn = document.querySelector(`[data-layer="${layer}"]`);
      if (btn) btn.click();
    },
    selectParcelById: (id) => {
      const p = parcelRecords.find((item) => item.id === id);
      if (p) {
        updateInspectorUI(p);
        return {
          id: p.id,
          district: p.district,
          currentZoneKey: p.currentZoneKey,
          currentZoneCode: p.currentZoneCode,
          units: p.units,
          jobs: p.jobs,
          targetFar: p.targetFar,
          targetHeight: p.targetHeight
        };
      }
      return null;
    }
  },
  telemetry: telemetryPipeline,
  simulation: simEngines,
  geminiBridge,
  activateScenarioPreset,
  runSimulationCycle
};

// Top-Level Public Interface Contracts (PROJECT.md)
window.TelemetryPipeline = telemetryPipeline;
window.SimulationEngines = simEngines;
