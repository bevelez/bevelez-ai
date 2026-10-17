/**
 * sim/constants.js — Shared Domain Constants, Provenance Labels, Zoning Envelopes,
 * Scenario Presets, and District Keys for the Mountain View Digital Twin.
 *
 * Every numerical constant cites its public source or clearly identifies itself as
 * an illustrative planning model parameter.
 */

// Provenance badge enum required by Remediation Brief Section 1
export const PROVENANCE = Object.freeze({
  LIVE: 'LIVE',                           // Live HTTP telemetry (Open-Meteo / NOAA CO-OPS 9414523)
  CACHED: 'CACHED',                       // Recent session cache from Open-Meteo / NOAA CO-OPS
  MODELED: 'MODELED',                     // Deterministic mathematical model (BPR, Spencer, Oke, Bilinear DEM, RHNA)
  FALLBACK_CONSTANT: 'FALLBACK CONSTANT', // Published fallback constant used when live API is offline
  PLACEHOLDER: 'PLACEHOLDER'              // Hard-coded illustrative constant
});

// Geographic & Scene Projection Constants (WGS84 -> Local Metric Scene Space)
// Source: USGS / OpenStreetMap relation 1544956 (City of Mountain View centroid)
// https://www.openstreetmap.org/relation/1544956
export const LON_CENTER = -122.0807;
export const LAT_CENTER = 37.4008;
export const LON_SCALE = 1085.0; // cos(37.40°N) * 1365.0; 1 scene unit ≈ 81.3 m
export const LAT_SCALE = 1365.0;
export const SCENE_METERS_PER_UNIT = 81.3;

// Mountain View Land Area: 12.27 sq mi = 31.78 km²
// Source: US Census Bureau QuickFacts — Mountain View city, California
// https://www.census.gov/quickfacts/mountainviewcitycalifornia
export const MV_LAND_AREA_KM2 = 31.78;
export const MV_LAND_AREA_M2 = 31780000;

// 6th Cycle Regional Housing Needs Allocation (RHNA, 2023–2031) for City of Mountain View
// Source: ABAG Final Regional Housing Needs Allocation (RHNA) Plan (2023–2031), p. 30
// https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf
// City of Mountain View 2023–2031 Housing Element:
// https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element
export const RHNA_6TH_CYCLE = Object.freeze({
  total: 11135,
  veryLow: 2773,       // <50% AMI (24.90%)
  low: 1597,           // 50–80% AMI (14.34%)
  moderate: 1885,      // 80–120% AMI (16.93%)
  aboveModerate: 4880, // >120% AMI (43.83%)
  avgGrossM2PerUnit: 85.0, // ~915 sq ft gross residential floor area per dwelling unit
  defaultInclusionaryRate: 0.15 // 15% BMR requirement (Mountain View City Code Ch. 36, Art. XIV)
});

// Zoning Envelope Definitions (Illustrative Municipal Zoning Archetypes, MODELED)
// Source: City of Mountain View Zoning Ordinance (City Code Chapter 36)
// https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance
export const ZONE_DEFS = Object.freeze({
  R1: {
    code: 'R-1 LOW',
    label: 'Single-Family / ADU Gentle Density',
    baseFar: 0.55,
    heightScale: 0.55,
    unitsPerArea: 0.35,
    jobsPerArea: 0.05,
    greenFactor: 0.28,
    colorHex: 0xf7f4eb,
    roughness: 0.78,
    metalness: 0.03
  },
  R3: {
    code: 'R-3 MID',
    label: 'Missing-Middle Courtyard Housing',
    baseFar: 1.65,
    heightScale: 1.25,
    unitsPerArea: 1.35,
    jobsPerArea: 0.22,
    greenFactor: 0.24,
    colorHex: 0xede8dc,
    roughness: 0.76,
    metalness: 0.03
  },
  MU6: {
    code: 'CRA-MU6',
    label: 'Mixed-Use Corridor Podium (4–6 Stories)',
    baseFar: 2.8,
    heightScale: 2.05,
    unitsPerArea: 2.4,
    jobsPerArea: 1.6,
    greenFactor: 0.20,
    colorHex: 0xf4eee2,
    roughness: 0.75,
    metalness: 0.03
  },
  TOD10: {
    code: 'TOD-10',
    label: 'High-Density Transit-Oriented Tower (8–12 Stories)',
    baseFar: 4.5,
    heightScale: 3.35,
    unitsPerArea: 4.2,
    jobsPerArea: 2.8,
    greenFactor: 0.26,
    colorHex: 0xeae5db,
    roughness: 0.74,
    metalness: 0.03
  },
  PARK: {
    code: 'OS-ECO',
    label: 'Restored Riparian Park & Bioswale',
    baseFar: 0.05,
    heightScale: 0.12,
    unitsPerArea: 0.0,
    jobsPerArea: 0.04,
    greenFactor: 0.92,
    colorHex: 0x28a86b,
    roughness: 0.82,
    metalness: 0.02
  }
});

// Canonical Precise Plan District Keys shared across mountain-view.js, sim/, and mv-planner-utility.js
// Sources:
// - North Bayshore Precise Plan: https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan
// - Downtown Precise Plan: https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/downtown-precise-plan
// - El Camino Real Precise Plan: https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan
// - East Whisman Precise Plan: https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/east-whisman-precise-plan
// - San Antonio Precise Plan: https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/san-antonio-precise-plan
export const DISTRICT_KEYS = Object.freeze({
  NB_PP: 'NB_PP',
  DT_CRA: 'DT_CRA',
  ECR_MU: 'ECR_MU',
  EW_TOD: 'EW_TOD',
  SA_PP: 'SA_PP',
  RES_SF: 'RES_SF'
});

export const PRECISE_PLAN_DISTRICTS = Object.freeze([
  {
    id: 'NB_PP',
    code: 'NB_PP',
    gisName: 'North Bayshore',
    zoneCode: 'NB-P',
    name: 'North Bayshore Precise Plan',
    shortName: 'North Bayshore',
    baseFar: 1.85,
    maxFar: 3.50,
    maxHeightFt: 160,
    rhnaTargetShare: 0.34,
    color: '#7cf2d6',
    bounds: { xMin: -28, xMax: 24, zMin: -42, zMax: -14 }
  },
  {
    id: 'DT_CRA',
    code: 'DT_CRA',
    gisName: 'Downtown Castro',
    zoneCode: 'DT-P',
    name: 'Downtown Precise Plan (Castro / Transit Center)',
    shortName: 'Downtown Castro',
    baseFar: 2.40,
    maxFar: 4.20,
    maxHeightFt: 100,
    rhnaTargetShare: 0.14,
    color: '#e8c076',
    bounds: { xMin: -12, xMax: 10, zMin: 4, zMax: 22 }
  },
  {
    id: 'ECR_MU',
    code: 'ECR_MU',
    gisName: 'El Camino Real',
    zoneCode: 'ECR-P',
    name: 'El Camino Real Precise Plan Corridor',
    shortName: 'El Camino Real',
    baseFar: 1.85,
    maxFar: 3.50,
    maxHeightFt: 85,
    rhnaTargetShare: 0.20,
    color: '#6bb8ff',
    bounds: { xMin: -42, xMax: 34, zMin: 10, zMax: 32 }
  },
  {
    id: 'EW_TOD',
    code: 'EW_TOD',
    gisName: 'East Whisman',
    zoneCode: 'EW-P',
    name: 'East Whisman Precise Plan (Middlefield / VTA)',
    shortName: 'East Whisman',
    baseFar: 1.60,
    maxFar: 3.20,
    maxHeightFt: 95,
    rhnaTargetShare: 0.18,
    color: '#b58cff',
    bounds: { xMin: 12, xMax: 44, zMin: -10, zMax: 16 }
  },
  {
    id: 'SA_PP',
    code: 'SA_PP',
    gisName: 'San Antonio',
    zoneCode: 'SA-P',
    name: 'San Antonio Precise Plan (TOD Village)',
    shortName: 'San Antonio',
    baseFar: 2.25,
    maxFar: 4.50,
    maxHeightFt: 120,
    rhnaTargetShare: 0.14,
    color: '#ff8a7a',
    bounds: { xMin: -44, xMax: -20, zMin: -14, zMax: 12 }
  }
]);

export const GIS_NAME_TO_DISTRICT_KEY = Object.freeze(
  PRECISE_PLAN_DISTRICTS.reduce((acc, d) => {
    acc[d.id] = d.id;
    acc[d.code] = d.id;
    acc[d.gisName] = d.id;
    acc[d.zoneCode] = d.id;
    acc[d.name] = d.id;
    acc[d.shortName] = d.id;
    return acc;
  }, { RES_SF: 'RES_SF', Residential: 'RES_SF' })
);

export function resolveDistrictKey(keyOrName) {
  if (!keyOrName) return null;
  if (GIS_NAME_TO_DISTRICT_KEY[keyOrName]) return GIS_NAME_TO_DISTRICT_KEY[keyOrName];
  const s = String(keyOrName).trim().toLowerCase();
  if (s.includes('bayshore') || s === 'nb' || s === 'nb-p' || s === 'nb_pp') return 'NB_PP';
  if (s.includes('castro') || s.includes('downtown') || s === 'dt' || s === 'dt-p' || s === 'dt_cra') return 'DT_CRA';
  if (s.includes('camino') || s === 'ecr' || s === 'ecr-p' || s === 'ecr_mu') return 'ECR_MU';
  if (s.includes('whisman') || s === 'ew' || s === 'ew-p' || s === 'ew_tod') return 'EW_TOD';
  if (s.includes('san antonio') || s.includes('antonio') || s === 'sa' || s === 'sa-p' || s === 'sa_pp') return 'SA_PP';
  if (s.includes('residential') || s === 'res' || s === 'res_sf') return 'RES_SF';
  return null;
}

export function getDistrictMultiplier(districtMultipliers, keyOrName) {
  if (!districtMultipliers || typeof districtMultipliers !== 'object') return 1.0;
  const canonical = resolveDistrictKey(keyOrName);
  if (canonical && Number.isFinite(districtMultipliers[canonical])) {
    return districtMultipliers[canonical];
  }
  if (canonical === 'SA_PP' && Number.isFinite(districtMultipliers.ECR_MU)) {
    return districtMultipliers.ECR_MU;
  }
  if (Number.isFinite(districtMultipliers[keyOrName])) {
    return districtMultipliers[keyOrName];
  }
  return 1.0;
}

// Curated What-If Planning Scenarios (MODELED)
export const SCENARIO_PRESETS = {
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
      SA_PP: 1.0,
      RES_SF: 1.0
    },
    summary:
      '[MODELED SCENARIO] 2026 Baseline loaded: US-101 V/C 0.88 (High), El Camino Real V/C 0.64 (Moderate), Caltrain Mountain View Station ~3,020 weekday boardings.'
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
      SA_PP: 1.15,
      RES_SF: 1.05
    },
    summary:
      '[MODELED SCENARIO] North Bayshore Precise Plan: residential neighborhoods around Bay View & Shoreline; 48% transit mode share reduces US-101 V/C to Moderate.'
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
      SA_PP: 2.25,
      RES_SF: 1.15
    },
    summary:
      '[MODELED SCENARIO] El Camino Real & Castro TOD: 6–8 story mixed-use podiums along SR-82 and San Antonio Center with 58% sustainable transit mode share.'
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
      SA_PP: 1.4,
      RES_SF: 1.1
    },
    summary:
      '[MODELED SCENARIO] East Whisman & Downtown Intensification: mixed-use TOD along VTA Light Rail and Downtown Castro Transit Center.'
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
      SA_PP: 1.75,
      RES_SF: 1.2
    },
    summary:
      '[MODELED SCENARIO] Sponge City 2040 (+1.2m SF Bay storm surge): SRTM elevation grid flood evaluation across North Bayshore; 38% tree canopy cools UHI.'
  }
};
SCENARIO_PRESETS.whisman = SCENARIO_PRESETS.eastwhisman;

// Traffic Assignment / BPR Volume-Delay Function Constants (Illustrative Macroscopic Model)
// Formula: T = T0 * (1 + alpha * (V/C)^beta), Bureau of Public Roads (1964) Traffic Assignment Manual
// Source: https://rosap.ntl.bts.gov/view/dot/15870
export const BPR_MODEL = Object.freeze({
  alpha: 0.15,
  beta: 4.0,
  us101FreeFlowMph: 65.0,
  us101CapacityVphpl: 2000,
  us101LanesEachWay: 4,
  elCaminoFreeFlowMph: 35.0,
  shorelineFreeFlowMph: 35.0,
  castroFreeFlowMph: 25.0,
  baselineVmtPerCapita: 14.2
});

// Caltrain Mountain View Station Weekday Ridership
// Source: Caltrain 2024 Annual Passenger Counts Report (Mountain View Station #19 average weekday boardings ~3,020)
// https://www.caltrain.com/about-caltrain/statistics-reports/ridership
export const CALTRAIN_RIDERSHIP = Object.freeze({
  mvStationWeekdayBoardings: 3020,
  sanAntonioWeekdayBoardings: 840,
  baselineTransitModeSharePct: 25.0
});

// Solar & Rooftop Photovoltaic Model Constants
// Sources:
// - Spencer (1971) Fourier series solar geometry ("Fourier series representation of the position of the sun", Search 2(5), 172)
// - NREL PVWatts v8 assumptions: https://pvwatts.nrel.gov/version_8.php
// - Open-Meteo Solar Radiation API (shortwave_radiation = GHI, direct_normal_irradiance = DNI): https://open-meteo.com/en/docs
// Baseline Rooftop PV Formula (Bug #5):
//   Σ area_m2 across 8,010 OSM buildings = 3,509,792.4 m²
//   Usable roof fraction = 0.42  → usableRoofM2 = 1,474,113 m²
//   Reference clear-sky irradiance (DNI_ref / GHI_ref) = 780.0 W/m²
//   Module efficiency (η_PV) = 0.20, Performance ratio (PR) = 0.80  → η_PV * PR = 0.16
//   P_baseline = (3,509,792.4 × 0.42 × 780.0 × 0.20 × 0.80) / 10^6 = 183.97 MW ≈ 184.0 MW
export const SOLAR_MODEL = Object.freeze({
  latitudeDeg: 37.3861,
  longitudeDeg: -122.0839,
  totalBuildingFootprintM2: 3509792.4,
  fallbackGhiWm2: 780.0,
  fallbackDniWm2: 780.0,
  fallbackTempC: 21.5,
  fallbackWindKmh: 12.0,
  usableRoofFraction: 0.42,
  moduleEfficiency: 0.20,
  performanceRatio: 0.80
});

// Coastal Hydrology & Sea-Level Rise Constants
// Sources:
// - NOAA CO-OPS Station 9414523 (Redwood City, CA): https://tidesandcurrents.noaa.gov/stationhome.html?id=9414523
// - Copernicus DEM GLO-90 / NASA SRTM 90m via Open-Meteo Elevation API: https://open-meteo.com/en/docs/elevation-api
export const HYDRO_MODEL = Object.freeze({
  noaaStationId: '9414523',
  noaaStationName: 'Redwood City, SF Bay (NOAA 9414523)',
  fallbackTideMetersNavd88: 1.72,
  spongeCityRunoffCaptureCoeff: 0.012
});

// Urban Heat Island (UHI) & Canopy Cooling Constants
// Sources:
// - Oke (1981) canyon geometry UHI model: ΔT_u-r = 1.38 + 0.42 * ln(H/W), https://doi.org/10.1007/BF00119215
// - Ziter et al. (2019) tree canopy nonlinear cooling threshold: https://doi.org/10.1073/pnas.1817561116
export const UHI_MODEL = Object.freeze({
  okeInterceptC: 1.38,
  okeSlopeC: 0.42,
  baselineCanopyPct: 16.4,
  linearCoolingPerPctC: 0.042,
  nonlinearCoolingAbove20PctC: 0.036
});

// Development Pro-Forma & Municipal Fiscal Constants (MODELED / ILLUSTRATIVE)
export const PRO_FORMA_CONSTANTS = Object.freeze({
  hardCostLowRisePerM2: 4850,
  hardCostHighRisePerM2: 6100,
  softCostRatio: 0.24,
  marketRentPerM2Yr: 540,
  bmrRentPerM2Yr: 215,
  operatingExpenseRatio: 0.28,
  exitCapRate: 0.0475,
  parkInLieuFeePerUnit: 38500,
  schoolImpactFeePerM2: 51.56,
  trafficHousingFeePerUnit: 14200,
  imperviousRoofRunoffFactor: 0.68
});
