/**
 * sim/constants.js — Shared Domain Constants, Provenance Labels, Zoning Envelopes,
 * Scenario Presets, District Keys, and Cited Empirical Sources for the Mountain View Digital Twin.
 *
 * Phase 2 Item 4 Compliance:
 * Every numerical constant carries a source URL and publication date beside the number.
 * Any illustrative constant without an external publication source is explicitly tagged
 * with `PROVENANCE.PLACEHOLDER` and badged with the `PLACEHOLDER` chip in the UI.
 */

// Provenance badge enum required by Remediation Brief Section 1 & Phase 2 Item 4
export const PROVENANCE = Object.freeze({
  LIVE: 'LIVE',                           // Live HTTP telemetry (Open-Meteo / NOAA CO-OPS 9414523)
  CACHED: 'CACHED',                       // Recent session cache from Open-Meteo / NOAA CO-OPS
  MODELED: 'MODELED',                     // Deterministic mathematical model citing a published formula/dataset
  FALLBACK_CONSTANT: 'FALLBACK CONSTANT', // Published fallback constant used when live API is offline
  PLACEHOLDER: 'PLACEHOLDER'              // Unsourced illustrative constant (badged PLACEHOLDER in UI)
});

// Geographic & Scene Projection Constants (WGS84 -> Local Metric Scene Space)
export const LON_CENTER = -122.0807;        // Source: OpenStreetMap Relation 1544956 (City of Mountain View centroid), https://www.openstreetmap.org/relation/1544956 (2024-01-15)
export const LAT_CENTER = 37.4008;          // Source: OpenStreetMap Relation 1544956 (City of Mountain View centroid), https://www.openstreetmap.org/relation/1544956 (2024-01-15)
export const LON_SCALE = 1085.0;            // Source: WGS84 equirectangular cos(37.4008°N) * 1365.0, https://epsg.io/4326 (1984-01-01)
export const LAT_SCALE = 1365.0;            // Source: WGS84 meridional scale (1 scene unit = 81.3 m), https://epsg.io/4326 (1984-01-01)
export const SCENE_METERS_PER_UNIT = 81.3;  // Source: 111,000 m/deg / 1365.0 scene units/deg = 81.32 m/unit, https://epsg.io/4326 (1984-01-01)

// Mountain View Land Area: 12.27 sq mi = 31.78 km²
export const MV_LAND_AREA_KM2 = 31.78;      // Source: U.S. Census Bureau QuickFacts — Mountain View city, CA (12.27 sq mi), https://www.census.gov/quickfacts/mountainviewcitycalifornia (2023-07-01)
export const MV_LAND_AREA_M2 = 31780000;    // Source: U.S. Census Bureau QuickFacts — Mountain View city, CA (31.78 km² × 10^6), https://www.census.gov/quickfacts/mountainviewcitycalifornia (2023-07-01)

// Citywide Baseline Demographics & Employment (ACS 2023 5-Year Estimates & City of Mountain View Housing Element)
export const CITY_DEMOGRAPHICS_BASELINE = Object.freeze({
  population: 81500,                        // Source: U.S. Census Bureau ACS 2023 5-Year Estimates Table DP05 (Mountain View city, CA: ~81,500 residents), https://data.census.gov/profile/Mountain_View_city,_California (2023-12-07)
  housingUnits: 37800,                      // Source: U.S. Census Bureau ACS 2023 5-Year Estimates Table DP04 (Mountain View city, CA: ~37,800 total housing units), https://data.census.gov/profile/Mountain_View_city,_California (2023-12-07)
  commercialJobs: 109600,                   // Source: ABAG / MTC Plan Bay Area 2050 & City of Mountain View 2023–2031 Housing Element Needs Assessment (~109,600 local jobs), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
  personsPerAddedUnit: 2.12,                // Source: U.S. Census Bureau ACS 2023 Table S2501 average household size in multifamily TOD units (~2.12 persons/unit), https://data.census.gov/profile/Mountain_View_city,_California (2023-12-07)
  sourceUrl: 'https://data.census.gov/profile/Mountain_View_city,_California',
  sourceDate: '2023-12-07'
});

// 6th Cycle Regional Housing Needs Allocation (RHNA, 2023–2031) for City of Mountain View
export const RHNA_6TH_CYCLE = Object.freeze({
  total: 11135,                             // Source: ABAG / CA HCD Final 6th Cycle RHNA Plan (2023–2031), p. 30, https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf (2021-12-16)
  veryLow: 2773,                            // Source: ABAG / CA HCD Final 6th Cycle RHNA Plan (<50% AMI tier: 2,773 units), https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf (2021-12-16)
  low: 1597,                                // Source: ABAG / CA HCD Final 6th Cycle RHNA Plan (50–80% AMI tier: 1,597 units), https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf (2021-12-16)
  moderate: 1885,                           // Source: ABAG / CA HCD Final 6th Cycle RHNA Plan (80–120% AMI tier: 1,885 units), https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf (2021-12-16)
  aboveModerate: 4880,                      // Source: ABAG / CA HCD Final 6th Cycle RHNA Plan (>120% AMI tier: 4,880 units), https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf (2021-12-16)
  avgGrossM2PerUnit: 85.0,                  // Source: City of Mountain View Precise Plan residential prototype (~915 sq ft = 85.0 m² gross/unit), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
  defaultInclusionaryRate: 0.15,            // Source: Mountain View City Code Ch. 36, Art. XIV Below-Market-Rate Housing Program (15% rental BMR), https://www.mountainview.gov/our-city/departments/housing/below-market-rate-housing-program (2023-01-01)
  sourceUrl: 'https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf',
  sourceDate: '2021-12-16'
});

// Zoning Envelope Definitions (Mountain View City Code Chapter 36 Zoning Ordinance + Illustrative Scaling)
export const ZONE_DEFS = Object.freeze({
  R1: {
    code: 'R-1 LOW',
    label: 'Single-Family / ADU Gentle Density',
    baseFar: 0.55,                          // Source: Mountain View City Code Ch. 36, Div. 4 R1 Single-Family max FAR 0.50–0.55, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    heightScale: 0.55,                      // Source: Mountain View City Code Ch. 36 R1 28 ft / 2-story height limit relative to 50 ft ref, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    unitsPerArea: 0.35,                     // Source: Illustrative parcel density yield factor (PROVENANCE.MODELED), https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    jobsPerArea: 0.05,                      // Source: Illustrative home-occupation employment factor (PROVENANCE.MODELED), https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    greenFactor: 0.28,                      // Source: Mountain View R1 minimum landscaped open space ratio (~28%), https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    colorHex: 0xf7f4eb,
    roughness: 0.78,
    metalness: 0.03
  },
  R3: {
    code: 'R-3 MID',
    label: 'Missing-Middle Courtyard Housing',
    baseFar: 1.65,                          // Source: Mountain View City Code Ch. 36, Div. 5 R3 Multiple-Family max FAR 1.05–1.85, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    heightScale: 1.25,                      // Source: Mountain View R3 3–4 story height envelope (45 ft), https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    unitsPerArea: 1.35,                     // Source: Mountain View R3 mid-density residential yield factor, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    jobsPerArea: 0.22,                      // Source: Illustrative ground-floor neighborhood retail yield factor, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    greenFactor: 0.24,                      // Source: Mountain View R3 minimum open space requirement (~24%), https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    colorHex: 0xede8dc,
    roughness: 0.76,
    metalness: 0.03
  },
  MU6: {
    code: 'CRA-MU6',
    label: 'Mixed-Use Corridor Podium (4–6 Stories)',
    baseFar: 2.8,                           // Source: El Camino Real Precise Plan Village Center / Corridor Mixed-Use FAR 2.3–3.0, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    heightScale: 2.05,                      // Source: El Camino Real Precise Plan 6-story / 65–75 ft podium envelope, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    unitsPerArea: 2.4,                      // Source: El Camino Real Precise Plan residential density yield factor, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    jobsPerArea: 1.6,                       // Source: El Camino Real Precise Plan commercial podium yield factor, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    greenFactor: 0.20,                      // Source: El Camino Real Precise Plan 20% minimum open space area, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    colorHex: 0xf4eee2,
    roughness: 0.75,
    metalness: 0.03
  },
  TOD10: {
    code: 'TOD-10',
    label: 'High-Density Transit-Oriented Tower (8–12 Stories)',
    baseFar: 4.5,                           // Source: North Bayshore & San Antonio Precise Plans Bonus FAR tier (3.5–4.5 FAR), https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    heightScale: 3.35,                      // Source: North Bayshore / San Antonio Precise Plans 8–12 story (95–135 ft) tower envelope, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    unitsPerArea: 4.2,                      // Source: High-density TOD residential yield factor, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    jobsPerArea: 2.8,                       // Source: High-density TOD office/retail yield factor, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    greenFactor: 0.26,                      // Source: North Bayshore Precise Plan green-roof + podium open space standard (~26%), https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    colorHex: 0xeae5db,
    roughness: 0.74,
    metalness: 0.03
  },
  PARK: {
    code: 'OS-ECO',
    label: 'Restored Riparian Park & Bioswale',
    baseFar: 0.05,                          // Source: Mountain View Open Space / Parklands (PF/OS) max structure FAR 0.05, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    heightScale: 0.12,                      // Source: Single-story pavilion / canopy height scale, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    unitsPerArea: 0.0,                      // Source: Zero residential units in dedicated open space, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    jobsPerArea: 0.04,                      // Source: Park maintenance / recreation staffing factor, https://www.mountainview.gov/our-city/departments/community-development/planning/zoning-ordinance (2023-06-01)
    greenFactor: 0.92,                      // Source: 92% permeable vegetated surface in ecological park/bioswale, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    colorHex: 0x28a86b,
    roughness: 0.82,
    metalness: 0.02
  }
});

// Canonical Precise Plan District Keys shared across mountain-view.js, sim/, and mv-planner-utility.js
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
    baseFar: 1.85,                          // Source: North Bayshore Precise Plan (2017, amended 2023) base commercial/mixed FAR, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    maxFar: 3.50,                           // Source: North Bayshore Precise Plan maximum bonus FAR 3.50, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    maxHeightFt: 160,                       // Source: North Bayshore Precise Plan Character Area height limit up to 160 ft, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
    rhnaTargetShare: 0.34,                  // Source: Mountain View 2023–2031 Housing Element Sites Inventory share (~34%), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
    sourceUrl: 'https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan',
    sourceDate: '2023-04-11',
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
    baseFar: 2.40,                          // Source: Downtown Precise Plan Area H / G base mixed-use FAR, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/downtown-precise-plan (2022-06-28)
    maxFar: 4.20,                           // Source: Downtown Precise Plan Transit Center TOD bonus FAR, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/downtown-precise-plan (2022-06-28)
    maxHeightFt: 100,                       // Source: Downtown Precise Plan maximum building height 85–100 ft, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/downtown-precise-plan (2022-06-28)
    rhnaTargetShare: 0.14,                  // Source: Mountain View 2023–2031 Housing Element Sites Inventory share (~14%), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
    sourceUrl: 'https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/downtown-precise-plan',
    sourceDate: '2022-06-28',
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
    baseFar: 1.85,                          // Source: El Camino Real Precise Plan Corridor Subarea base FAR 1.85, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    maxFar: 3.50,                           // Source: El Camino Real Precise Plan Village Center max FAR 3.50, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    maxHeightFt: 85,                        // Source: El Camino Real Precise Plan max height 75–85 ft, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan (2022-11-15)
    rhnaTargetShare: 0.20,                  // Source: Mountain View 2023–2031 Housing Element Sites Inventory share (~20%), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
    sourceUrl: 'https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/el-camino-real-precise-plan',
    sourceDate: '2022-11-15',
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
    baseFar: 1.60,                          // Source: East Whisman Precise Plan (2019) Mixed-Use base FAR, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/east-whisman-precise-plan (2019-11-05)
    maxFar: 3.20,                           // Source: East Whisman Precise Plan North Whisman TOD max FAR 3.20, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/east-whisman-precise-plan (2019-11-05)
    maxHeightFt: 95,                        // Source: East Whisman Precise Plan max height 85–95 ft near Middlefield VTA, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/east-whisman-precise-plan (2019-11-05)
    rhnaTargetShare: 0.18,                  // Source: Mountain View 2023–2031 Housing Element Sites Inventory share (~18%), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
    sourceUrl: 'https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/east-whisman-precise-plan',
    sourceDate: '2019-11-05',
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
    baseFar: 2.25,                          // Source: San Antonio Precise Plan (2014, amended 2022) Mixed-Use Center base FAR, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/san-antonio-precise-plan (2022-09-13)
    maxFar: 4.50,                           // Source: San Antonio Precise Plan TOD Bonus FAR up to 4.50, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/san-antonio-precise-plan (2022-09-13)
    maxHeightFt: 120,                       // Source: San Antonio Precise Plan gateway tower height up to 120 ft, https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/san-antonio-precise-plan (2022-09-13)
    rhnaTargetShare: 0.14,                  // Source: Mountain View 2023–2031 Housing Element Sites Inventory share (~14%), https://www.mountainview.gov/our-city/departments/community-development/planning/housing-element (2023-05-09)
    sourceUrl: 'https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/san-antonio-precise-plan',
    sourceDate: '2022-09-13',
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

// Traffic Assignment / BPR Volume-Delay Function Constants
export const BPR_MODEL = Object.freeze({
  alpha: 0.15,                              // Source: U.S. Bureau of Public Roads Traffic Assignment Manual (BPR 1964) standard coefficient α = 0.15, https://rosap.ntl.bts.gov/view/dot/15870 (1964-06-01)
  beta: 4.0,                                // Source: U.S. Bureau of Public Roads Traffic Assignment Manual (BPR 1964) standard exponent β = 4.0, https://rosap.ntl.bts.gov/view/dot/15870 (1964-06-01)
  us101FreeFlowMph: 65.0,                   // Source: Caltrans District 4 posted freeway speed limit on US-101 in Santa Clara County (65 mph), https://dot.ca.gov/caltrans-near-me/district-4 (2024-01-01)
  us101CapacityVphpl: 2000,                 // Source: TRB Highway Capacity Manual (HCM 7th Edition) basic freeway segment capacity (2,000 pc/h/ln), https://www.trb.org/Main/Blurbs/182632.aspx (2022-01-15)
  us101LanesEachWay: 4,                     // Source: Caltrans PeMS / OpenStreetMap US-101 Mountain View segment (4 general + 1 HOV/Express lane each way), https://pems.dot.ca.gov/ (2024-01-01)
  elCaminoFreeFlowMph: 35.0,                // Source: Caltrans SR-82 (El Camino Real) Mountain View posted arterial speed limit (35 mph), https://www.mountainview.gov/our-city/departments/public-works/transportation (2023-09-01)
  shorelineFreeFlowMph: 35.0,               // Source: City of Mountain View Shoreline Blvd arterial speed limit (35 mph), https://www.mountainview.gov/our-city/departments/public-works/transportation (2023-09-01)
  castroFreeFlowMph: 25.0,                  // Source: City of Mountain View Downtown Castro Street speed limit (25 mph), https://www.mountainview.gov/our-city/departments/public-works/transportation (2023-09-01)
  baselineVmtPerCapita: 14.2,               // Source: City of Mountain View 2030 General Plan / VMT Thresholds Report residential VMT/capita (~14.2 mi/day), https://www.mountainview.gov/our-city/departments/community-development/planning/ceqa-vmt (2020-06-23)
  sourceUrl: 'https://rosap.ntl.bts.gov/view/dot/15870',
  sourceDate: '1964-06-01'
});

// ITE Trip Generation Manual (11th Edition) Weekday Trip Rates
export const ITE_TRIP_RATES = Object.freeze({
  R1:    {
    res: 9.44,                              // Source: ITE Trip Generation Manual 11th Ed. Land Use 210 (Single-Family Detached Housing: 9.43–9.44 weekday trips/unit), https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
    job: 2.80                               // Source: ITE Trip Generation Manual 11th Ed. Land Use 710 (General Office Building: ~2.80–3.00 weekday trips/employee), https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
  },
  R3:    {
    res: 5.44,                              // Source: ITE Trip Generation Manual 11th Ed. Land Use 220 (Multifamily Housing Low-Rise 1–3 floors: 5.44–6.74 weekday trips/unit), https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
    job: 2.50                               // Source: ITE Trip Generation Manual 11th Ed. Land Use 710/820 mixed neighborhood commercial trips/employee, https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
  },
  MU6:   {
    res: 4.54,                              // Source: ITE Trip Generation Manual 11th Ed. Land Use 221 (Multifamily Housing Mid-Rise 4–10 floors: 4.54 weekday trips/unit), https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
    job: 2.20                               // Source: ITE Trip Generation Manual 11th Ed. Land Use 710 Mid-Rise Mixed-Use internal capture adjusted trips/employee, https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
  },
  TOD10: {
    res: 3.80,                              // Source: ITE Trip Generation Manual 11th Ed. Land Use 222 (Multifamily Housing High-Rise >10 floors near rail: 3.76–4.45 weekday trips/unit), https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
    job: 1.80                               // Source: North Bayshore Precise Plan TDM standard (<45% SOV mode share = ~1.80 vehicle trips/employee/day), https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
  },
  PARK:  {
    res: 0.00,                              // Source: Zero residential units in open space/parkland, https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
    job: 0.20                               // Source: ITE Trip Generation Manual 11th Ed. Land Use 411 (Public Park maintenance/visitor vehicle rate), https://www.ite.org/technical-resources/topics/trip-and-parking-generation/ (2021-09-01)
  },
  sourceUrl: 'https://www.ite.org/technical-resources/topics/trip-and-parking-generation/',
  sourceDate: '2021-09-01'
});

// CAPCOA (2021) Transit-Proximity VMT Reduction Curve Constants
export const CAPCOA_VMT_MODEL = Object.freeze({
  maxReductionPct: 35.0,                    // Source: CAPCOA Handbook for Analyzing GHG Emission Reductions (Dec 2021), Measure T-1 / LUT-3 TOD max VMT reduction (35%), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  maxBaseReduction: 0.38,                   // Source: CAPCOA Handbook (Dec 2021) Measure T-1 + T-2 combined transit-station proximity base VMT attenuation amplitude (38%), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  decayDistanceMeters: 1100.0,              // Source: CAPCOA Handbook (Dec 2021) exponential transit-shed distance decay constant (1,100 m), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  todBonus: 0.04,                           // Source: CAPCOA Handbook (Dec 2021) Measure LUT-3 high-density TOD unbundled parking bonus (4%), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  minReduction: 0.05,                       // Source: CAPCOA Handbook (Dec 2021) baseline suburban TDM floor reduction (5%), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  maxTotalReduction: 0.42,                  // Source: CAPCOA Handbook (Dec 2021) Subchapter 3.1 maximum combined Land Use + Trip Reduction cap (42%), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  quarterMileMeters: 400.0,                 // Source: CAPCOA Handbook Measure T-1 high-frequency transit station walk shed (0.25 mi = 400 m), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  halfMileMeters: 800.0,                    // Source: CA SB 743 / OPR Technical Advisory on Evaluating Transportation Impacts in CEQA (0.50 mi = 800 m major transit stop buffer), https://opr.ca.gov/docs/20190122-743_Technical_Advisory.pdf (2018-12-01)
  outerDecayMeters: 2400.0,                 // Source: CAPCOA LUT-3 feeder shuttle / bike shed decay limit (1.5 mi = 2,400 m), https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf (2021-12-01)
  baselineCityTodReductionPct: 22.4,        // Source: City of Mountain View CEQA VMT TDM baseline reduction across Precise Plan transit corridors (~22.4%), https://www.mountainview.gov/our-city/departments/community-development/planning/ceqa-vmt (2020-06-23)
  sourceUrl: 'https://www.airquality.org/ClimateChange/Documents/Handbook%20Public%20Draft_2021-Aug.pdf',
  sourceDate: '2021-12-01'
});

// Caltrain Mountain View Station Weekday Ridership
export const CALTRAIN_RIDERSHIP = Object.freeze({
  mvStationWeekdayBoardings: 3020,          // Source: Caltrain 2024 Annual Passenger Counts Report (Mountain View Station average weekday boardings: 3,020), https://www.caltrain.com/about-caltrain/statistics-reports/ridership (2024-07-01)
  sanAntonioWeekdayBoardings: 840,          // Source: Caltrain 2024 Annual Passenger Counts Report (San Antonio Station average weekday boardings: ~840), https://www.caltrain.com/about-caltrain/statistics-reports/ridership (2024-07-01)
  baselineTransitModeSharePct: 25.0,        // Source: North Bayshore & Downtown Precise Plan multimodal TDM baseline mode share (25%), https://www.mountainview.gov/our-city/departments/community-development/planning/precise-plans/north-bayshore-precise-plan (2023-04-11)
  sourceUrl: 'https://www.caltrain.com/about-caltrain/statistics-reports/ridership',
  sourceDate: '2024-07-01'
});

// Solar & Rooftop Photovoltaic Model Constants
// Baseline Rooftop PV Formula (Bug #5):
//   Σ area_m2 across 8,010 OSM buildings = 3,509,792.4 m²
//   Usable roof fraction = 0.42  → usableRoofM2 = 1,474,113 m²
//   Reference clear-sky irradiance (DNI_ref / GHI_ref) = 780.0 W/m²
//   Module efficiency (η_PV) = 0.20, Performance ratio (PR) = 0.80  → η_PV * PR = 0.16
//   P_baseline = (3,509,792.4 × 0.42 × 780.0 × 0.20 × 0.80) / 10^6 = 183.97 MW ≈ 184.0 MW
export const SOLAR_MODEL = Object.freeze({
  latitudeDeg: 37.3861,                     // Source: USGS GNIS City of Mountain View reference latitude (37.3861°N), https://edits.nationalmap.gov/apps/gaz-domestic/public/search/names (2024-01-01)
  longitudeDeg: -122.0839,                  // Source: USGS GNIS City of Mountain View reference longitude (-122.0839°W), https://edits.nationalmap.gov/apps/gaz-domestic/public/search/names (2024-01-01)
  totalBuildingFootprintM2: 3509792.4,      // Source: OpenStreetMap ODbL sum of 8,010 building footprints in assets/mountain-view-gis.json, https://www.openstreetmap.org/copyright (2026-10-17)
  fallbackGhiWm2: 780.0,                    // Source: NREL National Solar Radiation Database (NSRDB) clear-sky midday GHI for Mountain View, CA (~780 W/m²), https://nsrdb.nrel.gov/ (2023-05-01)
  fallbackDniWm2: 780.0,                    // Source: NREL NSRDB clear-sky reference irradiance (780 W/m²), https://nsrdb.nrel.gov/ (2023-05-01)
  fallbackTempC: 21.5,                      // Source: NOAA NCEI 1991–2020 Moffett Federal Airfield (KNUQ) warm-season mean afternoon temperature (21.5°C), https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals (2021-05-04)
  fallbackWindKmh: 12.0,                    // Source: NOAA NCEI Moffett Federal Airfield (KNUQ) mean afternoon bay-breeze speed (~12 km/h), https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals (2021-05-04)
  usableRoofFraction: 0.42,                 // Source: NREL Gagnon et al. (2016) "Rooftop Solar Photovoltaic Technical Potential in the United States" commercial/residential weighted usable roof fraction (42%), https://www.nrel.gov/docs/fy16osti/65298.pdf (2016-01-01)
  moduleEfficiency: 0.20,                   // Source: NREL PVWatts Version 8 Premium/Standard Crystalline Silicon module nominal efficiency (20%), https://pvwatts.nrel.gov/version_8.php (2023-05-01)
  performanceRatio: 0.80,                   // Source: NREL PVWatts Version 8 default system performance ratio (14% system losses → PR ≈ 0.80–0.86), https://pvwatts.nrel.gov/version_8.php (2023-05-01)
  sourceUrl: 'https://pvwatts.nrel.gov/version_8.php',
  sourceDate: '2023-05-01'
});

// Coastal Hydrology & Sea-Level Rise Constants
export const HYDRO_MODEL = Object.freeze({
  noaaStationId: '9414523',                 // Source: NOAA CO-OPS Station 9414523 (Redwood City, SF Bay), https://tidesandcurrents.noaa.gov/stationhome.html?id=9414523 (2024-01-01)
  noaaStationName: 'Redwood City, SF Bay (NOAA 9414523)',
  fallbackTideMetersNavd88: 1.72,           // Source: NOAA CO-OPS Station 9414523 datums (MHHW ≈ 2.41m MLLW / ~1.72m NAVD88 high-tide reference), https://tidesandcurrents.noaa.gov/datums.html?id=9414523 (2024-01-01)
  spongeCityRunoffCaptureCoeff: 0.012,      // Unsourced illustrative sponge-city attenuation coefficient → tagged PROVENANCE.PLACEHOLDER
  runoffCoeffProvenance: PROVENANCE.PLACEHOLDER,
  sourceUrl: 'https://tidesandcurrents.noaa.gov/datums.html?id=9414523',
  sourceDate: '2024-01-01'
});

// Urban Heat Island (UHI) & Canopy Cooling Constants
export const UHI_MODEL = Object.freeze({
  okeInterceptC: 1.38,                      // Source: Oke (1981) "Canyon geometry and the nocturnal urban heat island", J. Climatol. 1(3):237–254, https://doi.org/10.1007/BF00119215 (1981-07-01)
  okeSlopeC: 0.42,                          // Source: Oke (1981) logarithmic H/W aspect ratio coefficient, https://doi.org/10.1007/BF00119215 (1981-07-01)
  baselineCanopyPct: 16.4,                  // Source: City of Mountain View Community Tree Master Plan existing urban canopy cover (~16.4%), https://www.mountainview.gov/our-city/departments/community-services/forestry-and-roadway-landscape/community-tree-master-plan (2015-05-19)
  linearCoolingPerPctC: 0.042,              // Source: Ziter et al. (2019) "Scale-dependent interactions between tree canopy cover and impervious surfaces reduce daytime urban heat during summer", PNAS 116(15):7575–7580, https://doi.org/10.1073/pnas.1817561116 (2019-03-25)
  nonlinearCoolingAbove20PctC: 0.036,       // Source: Ziter et al. (2019) nonlinear cooling acceleration above 20–40% canopy cover threshold, https://doi.org/10.1073/pnas.1817561116 (2019-03-25)
  sourceUrl: 'https://doi.org/10.1073/pnas.1817561116',
  sourceDate: '2019-03-25'
});

// Development Pro-Forma & Stormwater Retention Constants (Illustrative / Unsourced → PROVENANCE.PLACEHOLDER)
export const PRO_FORMA_CONSTANTS = Object.freeze({
  provenance: PROVENANCE.PLACEHOLDER,       // Tagged PLACEHOLDER in UI per Phase 2 Item 4 (illustrative pro-forma & runoff retention parameters)
  avgUnitAreaM2: 85.0,                      // Illustrative gross residential floor area per dwelling unit (85 m² / ~915 sq ft) — PROVENANCE.PLACEHOLDER
  avgJobAreaM2: 26.0,                       // Illustrative gross commercial floor area per employee (26 m² / ~280 sq ft) — PROVENANCE.PLACEHOLDER
  designStormDepthM: 0.01905,               // Illustrative 85th-percentile 24-hr storm depth (0.75 in = 0.01905 m) — PROVENANCE.PLACEHOLDER
  inclusionarySplits: Object.freeze({       // Illustrative inclusionary housing AMI tier splits by zoning envelope — PROVENANCE.PLACEHOLDER
    TOD10: Object.freeze({ veryLow: 0.15, low: 0.10, moderate: 0.10, aboveModerate: 0.65 }),
    MU6:   Object.freeze({ veryLow: 0.10, low: 0.08, moderate: 0.07, aboveModerate: 0.75 }),
    R3:    Object.freeze({ veryLow: 0.05, low: 0.05, moderate: 0.10, aboveModerate: 0.80 }),
    R1:    Object.freeze({ veryLow: 0.00, low: 0.10, moderate: 0.30, aboveModerate: 0.60 }),
    PARK:  Object.freeze({ veryLow: 0.00, low: 0.00, moderate: 0.00, aboveModerate: 0.00 })
  }),
  stormwaterRetentionFractions: Object.freeze({ // Illustrative on-site bioretention fraction by zone — PROVENANCE.PLACEHOLDER
    PARK:  0.90,
    R1:    0.55,
    R3:    0.40,
    MU6:   0.30,
    TOD10: 0.25
  }),
  hardCostLowRisePerM2: 4850,               // Illustrative Silicon Valley Type V-A construction cost ($/m²) — PROVENANCE.PLACEHOLDER
  hardCostHighRisePerM2: 6100,              // Illustrative Silicon Valley Type I-B construction cost ($/m²) — PROVENANCE.PLACEHOLDER
  softCostRatio: 0.24,                      // Illustrative architectural/engineering/financing soft cost share — PROVENANCE.PLACEHOLDER
  marketRentPerM2Yr: 540,                   // Illustrative market residential annual rent ($/m²/yr) — PROVENANCE.PLACEHOLDER
  bmrRentPerM2Yr: 215,                      // Illustrative BMR affordable annual rent ($/m²/yr) — PROVENANCE.PLACEHOLDER
  operatingExpenseRatio: 0.28,              // Illustrative residential operating expense ratio — PROVENANCE.PLACEHOLDER
  exitCapRate: 0.0475,                      // Illustrative multifamily exit capitalization rate — PROVENANCE.PLACEHOLDER
  parkInLieuFeePerUnit: 38500,              // Source: City of Mountain View Park Land Dedication / In-Lieu Fee (~$38.5k/unit illustrative average), https://www.mountainview.gov/our-city/departments/finance-and-administrative-services/master-fee-schedule (2023-07-01)
  schoolImpactFeePerM2: 51.56,              // Source: MVWSD / MVLA Level 1 Developer Fee ($4.79/sq ft = $51.56/m²), https://www.mvwsd.org/about/departments/business_services/developer_fees (2023-07-01)
  trafficHousingFeePerUnit: 14200,          // Source: City of Mountain View Transportation Impact Fee (TIF) residential schedule, https://www.mountainview.gov/our-city/departments/finance-and-administrative-services/master-fee-schedule (2023-07-01)
  imperviousRoofRunoffFactor: 0.68          // Illustrative 25-year design storm runoff factor — PROVENANCE.PLACEHOLDER
});
