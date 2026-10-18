/**
 * Mountain View Digital Twin — City Planner Utility & Decision-Support Module
 * mv-planner-utility.js (ES Module)
 *
 * Implements deterministic, provenance-tagged urban planning calculations:
 * - ABAG 6th Cycle RHNA income-tier allocation (11,135 unit target)
 * - 5 Mountain View Precise Plan district scorecards (Bug #3 fixed via shared district keys)
 * - Parcel- & OSM-building-level pro-forma envelope, ITE trip generation & transit proximity VMT model (Bug #6 fixed)
 * - Rooftop solar PV potential (from Σ area_m2 in GIS JSON) & stormwater runoff retention estimate (Bug #5 fixed)
 * - Precise Plan district batch-rezoning with Undo stack (Section 4 UX requirement)
 * - 12-indicator scenario delta comparison with guaranteed zero delta at Baseline (Bugs #4 & #5 fixed)
 * - Honest exportable planning reports with provenance chips and zero unverified legal/compliance claims (Section 1 fixed)
 */

import {
  PROVENANCE,
  CITY_DEMOGRAPHICS_BASELINE,
  RHNA_6TH_CYCLE,
  ITE_TRIP_RATES,
  CAPCOA_VMT_MODEL,
  PRO_FORMA_CONSTANTS,
  getDistrictMultiplier,
  resolveDistrictKey
} from './sim/constants.js';

// ABAG 6th Cycle RHNA Targets for City of Mountain View (2023–2031)
// Source: https://abag.ca.gov/sites/default/files/documents/2021-12/Final_RHNA_Allocation_Plan_2023-2031.pdf (2021-12-16)
export const RHNA_MANDATES = Object.freeze({
  targetTotal: RHNA_6TH_CYCLE.total,        // 11,135
  veryLow: RHNA_6TH_CYCLE.veryLow,          // 2,773 (<50% AMI)
  low: RHNA_6TH_CYCLE.low,                  // 1,597 (50–80% AMI)
  moderate: RHNA_6TH_CYCLE.moderate,        // 1,885 (80–120% AMI)
  aboveModerate: RHNA_6TH_CYCLE.aboveModerate // 4,880 (>120% AMI)
});

// Illustrative inclusionary affordability splits by zoning envelope (PRO_FORMA_CONSTANTS, PLACEHOLDER)
const INCLUSIONARY_SPLITS = PRO_FORMA_CONSTANTS.inclusionarySplits;

// 5 Mountain View Precise Plan District Definitions
export const PLANNER_DISTRICT_DEFS = {
  NB_PP: {
    name: 'North Bayshore Precise Plan',
    code: 'NB-P',
    baselineFar: 0.40,
    targetFar: 3.20,
    resShare: 0.65,
    baselineUnits: 2800,
    baselineJobs: 48200,
    defaultFootprintM2: 1126275,
    defaultBuildingCount: 414,
    gisName: 'North Bayshore'
  },
  EW_TOD: {
    name: 'East Whisman Precise Plan',
    code: 'EW-P',
    baselineFar: 0.50,
    targetFar: 3.10,
    resShare: 0.60,
    baselineUnits: 4200,
    baselineJobs: 24600,
    defaultFootprintM2: 432425,
    defaultBuildingCount: 477,
    gisName: 'East Whisman'
  },
  ECR_MU: {
    name: 'El Camino Real Precise Plan',
    code: 'ECR-P',
    baselineFar: 0.60,
    targetFar: 2.80,
    resShare: 0.75,
    baselineUnits: 6100,
    baselineJobs: 15800,
    defaultFootprintM2: 245368,
    defaultBuildingCount: 382,
    gisName: 'El Camino Real'
  },
  SA_PP: {
    name: 'San Antonio Precise Plan',
    code: 'SA-P',
    baselineFar: 0.70,
    targetFar: 3.00,
    resShare: 0.70,
    baselineUnits: 3400,
    baselineJobs: 9800,
    defaultFootprintM2: 193860,
    defaultBuildingCount: 162,
    gisName: 'San Antonio'
  },
  DT_CRA: {
    name: 'Downtown Castro Precise Plan',
    code: 'DT-P',
    baselineFar: 1.50,
    targetFar: 2.60,
    resShare: 0.50,
    baselineUnits: 3100,
    baselineJobs: 11200,
    defaultFootprintM2: 154632,
    defaultBuildingCount: 446,
    gisName: 'Downtown Castro'
  }
};

const CALTRAIN_STATIONS = {
  downtown: {
    name: 'Mountain View Transit Center (Caltrain)',
    lat: 37.39434,
    lon: -122.07588
  },
  sanAntonio: {
    name: 'San Antonio Caltrain Station',
    lat: 37.40741,
    lon: -122.10724
  }
};

// ITE Trip Generation Manual 11th Edition (2021-09) weekday rates from sim/constants.js
const ITE_RATES = ITE_TRIP_RATES.rates || ITE_TRIP_RATES;

// Unsourced illustrative stormwater retention ratios from sim/constants.js (PROVENANCE.PLACEHOLDER)
const STORMWATER_RETENTION_FRACTIONS = PRO_FORMA_CONSTANTS.stormwaterRetentionFractions;

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function normalizeDistrictKey(rawKey) {
  return resolveDistrictKey(rawKey);
}

export function normalizeZoneKey(rawKey) {
  if (!rawKey) return null;
  const k = String(rawKey).trim().toUpperCase();
  if (k === 'TOD10' || k === 'TOD-10' || k === 'TOD') return 'TOD10';
  if (k === 'MU6' || k === 'CRA-MU6' || k === 'CRA-MU' || k === 'MU' || k === 'CRA') return 'MU6';
  if (k === 'R3' || k === 'R-3' || k === 'R-3 MID') return 'R3';
  if (k === 'R1' || k === 'R-1' || k === 'R-1 LOW') return 'R1';
  if (k === 'PARK' || k === 'OS-ECO' || k === 'ECO') return 'PARK';
  return null;
}

export function createPlannerUtility(twinInstance) {
  let _twin = twinInstance || null;
  const _undoStack = [];

  function getTwin() {
    if (_twin) return _twin;
    if (typeof window !== 'undefined' && window.MountainViewTwin) {
      _twin = window.MountainViewTwin;
      return _twin;
    }
    return null;
  }

  function getSnapshot() {
    const twin = getTwin();
    if (twin && twin.telemetry && typeof twin.telemetry.getSnapshot === 'function') {
      return twin.telemetry.getSnapshot();
    }
    return {
      housingUnits: 37800,
      rhnaDelta: 0,
      jobs: 109600,
      jobsHousingRatio: 2.90,
      transitShare: 25.0,
      caltrainHeadway: 12,
      solarMw: 212.3,
      planningSolarMw: 212.3,
      greenspacePct: 16.4,
      uhiDelta: 0.0,
      corridors: {
        us101: { vc: 0.88, los: 'D', label: '0.88 / High' },
        ecr: { vc: 0.64, los: 'B', label: '0.64 / Moderate' }
      },
      flood: { inundatedBuildingCount: 0, inundatedAreaKm2: 0.0 }
    };
  }

  function getParcels() {
    const twin = getTwin();
    if (twin && twin.viewport && Array.isArray(twin.viewport.parcelRecords)) {
      return twin.viewport.parcelRecords;
    }
    return [];
  }

  function getGisBuildings() {
    const twin = getTwin();
    const gisData = (twin && twin.viewport && twin.viewport.mvGisData) || (typeof window !== 'undefined' ? window.mvGisData : null);
    return (gisData && Array.isArray(gisData.buildings)) ? gisData.buildings : [];
  }

  /**
   * 1. 6th Cycle RHNA Income-Tier Breakdown (11,135 target: 2,773 + 1,597 + 1,885 + 4,880)
   */
  function getRhnaTierBreakdown() {
    const snap = getSnapshot();
    const parcels = getParcels();
    const netUnits = Math.max(0, snap.rhnaDelta !== undefined ? snap.rhnaDelta : (snap.housingUnits - 37800));

    let totalParcelUnits = 0;
    let wVl = 0;
    let wL = 0;
    let wMod = 0;

    for (const p of parcels) {
      const zoneKey = p.currentZoneKey || p.baseZone || 'MU6';
      const split = INCLUSIONARY_SPLITS[zoneKey] || INCLUSIONARY_SPLITS.MU6;
      const u = p.units || 1;
      totalParcelUnits += u;
      wVl += u * split.veryLow;
      wL += u * split.low;
      wMod += u * split.moderate;
    }

    const normVl = totalParcelUnits > 0 ? (wVl / totalParcelUnits) : INCLUSIONARY_SPLITS.MU6.veryLow;
    const normL = totalParcelUnits > 0 ? (wL / totalParcelUnits) : INCLUSIONARY_SPLITS.MU6.low;
    const normMod = totalParcelUnits > 0 ? (wMod / totalParcelUnits) : INCLUSIONARY_SPLITS.MU6.moderate;
    const normAbove = Math.max(0, 1.0 - (normVl + normL + normMod));

    const vlUnits = Math.round(netUnits * normVl);
    const lUnits = Math.round(netUnits * normL);
    const modUnits = Math.round(netUnits * normMod);
    const aboveUnits = Math.max(0, netUnits - (vlUnits + lUnits + modUnits));

    return {
      provenance: PROVENANCE.MODELED,
      formula: 'ABAG 6th Cycle RHNA (11,135 total: 2,773 VL + 1,597 L + 1,885 Mod + 4,880 Above Mod)',
      targetTotal: RHNA_MANDATES.targetTotal,
      currentNetUnits: netUnits,
      percentComplete: +((netUnits / RHNA_MANDATES.targetTotal) * 100).toFixed(1),
      tiers: {
        veryLow: {
          target: RHNA_MANDATES.veryLow,
          units: vlUnits,
          percent: +((vlUnits / RHNA_MANDATES.veryLow) * 100).toFixed(1)
        },
        low: {
          target: RHNA_MANDATES.low,
          units: lUnits,
          percent: +((lUnits / RHNA_MANDATES.low) * 100).toFixed(1)
        },
        moderate: {
          target: RHNA_MANDATES.moderate,
          units: modUnits,
          percent: +((modUnits / RHNA_MANDATES.moderate) * 100).toFixed(1)
        },
        aboveModerate: {
          target: RHNA_MANDATES.aboveModerate,
          units: aboveUnits,
          percent: +((aboveUnits / RHNA_MANDATES.aboveModerate) * 100).toFixed(1)
        }
      },
      effectiveInclusionaryRate: +((1.0 - normAbove) * 100).toFixed(1)
    };
  }

  /**
   * 2. 5 Precise Plan District Scorecards (Bug #3 Fixed: reads canonical key NB_PP..SA_PP via getDistrictMultiplier)
   */
  function getDistrictScorecards() {
    const twin = getTwin();
    const buildings = getGisBuildings();
    const sim = (twin && twin.simulation) || null;
    const farCap = (sim && sim.params && sim.params.farCap) || 2.4;
    const farFactor = farCap / 2.4;

    const scorecards = {};

    for (const [districtKey, def] of Object.entries(PLANNER_DISTRICT_DEFS)) {
      const matched = buildings.filter((b) => b.district === def.gisName);
      let footprintSqm = 0;
      for (const b of matched) {
        footprintSqm += (Number(b.area_m2) || 0);
      }
      if (footprintSqm === 0) {
        footprintSqm = def.defaultFootprintM2;
      }

      const parcelCount = matched.length > 0 ? matched.length : def.defaultBuildingCount;
      const totalFootprintAcres = +(footprintSqm / 4046.8564).toFixed(2);

      // Bug #3 Fix: Resolve multiplier via canonical districtKey (NB_PP, DT_CRA, ECR_MU, EW_TOD, SA_PP)
      const distMult = getDistrictMultiplier(sim && sim.districtMultipliers, districtKey);
      const targetFar = +(def.targetFar * distMult * (0.65 + 0.35 * farFactor)).toFixed(2);
      const currentFar = def.baselineFar;

      const deltaFar = Math.max(0, targetFar - currentFar);
      const addedGfa = Math.round(footprintSqm * deltaFar);

      const netAddedUnits = Math.round((addedGfa * def.resShare) / 85.0);
      const netAddedJobs = Math.round((addedGfa * (1.0 - def.resShare)) / 26.0);

      const totalUnits = def.baselineUnits + netAddedUnits;
      const totalJobs = def.baselineJobs + netAddedJobs;
      const jobsHousingRatio = +(totalJobs / Math.max(1, totalUnits)).toFixed(2);
      const rhnaContributionPercent = +((netAddedUnits / RHNA_MANDATES.targetTotal) * 100).toFixed(1);

      scorecards[districtKey] = {
        id: districtKey,
        name: def.name,
        code: def.code,
        gisName: def.gisName,
        multiplier: +distMult.toFixed(2),
        parcelCount,
        totalFootprintSqm: Math.round(footprintSqm),
        totalFootprintAcres,
        currentFar,
        targetFar,
        netAddedUnits,
        netAddedJobs,
        jobsHousingRatio,
        rhnaContributionPercent,
        provenance: PROVENANCE.MODELED
      };
    }

    return scorecards;
  }

  /**
   * 3. Parcel & Static OSM Building Pro-Forma Envelope Inspector (Bug #6 Fixed)
   * Supports both interactive zoning parcels (MV-PARCEL-*) and all 8,010 extruded OSM buildings (osm_way_*).
   */
  function getParcelProForma(parcelId) {
    const twin = getTwin();
    const parcels = getParcels();
    const gisBuildings = getGisBuildings();
    let p = null;
    let isStaticOsmBuilding = false;

    if (parcelId !== undefined && parcelId !== null) {
      p = parcels.find((item) => String(item.id) === String(parcelId));
      if (!p) {
        const osmB = gisBuildings.find((b) => String(b.id) === String(parcelId));
        if (osmB) {
          isStaticOsmBuilding = true;
          const distKey = normalizeDistrictKey(osmB.district) || 'NB_PP';
          const zoneKey = osmB.zone === 'DT-P' || osmB.zone === 'SA-P'
            ? 'TOD10'
            : (osmB.zone === 'R' ? 'R1' : 'MU6');
          p = {
            id: osmB.id,
            name: osmB.name || `Unnamed OSM Building (${osmB.id})`,
            district: distKey,
            districtName: osmB.district || 'Mountain View',
            baseZone: zoneKey,
            currentZoneKey: zoneKey,
            currentZoneCode: osmB.zone || 'R',
            lat: Array.isArray(osmB.center) ? osmB.center[1] : 37.396,
            lon: Array.isArray(osmB.center) ? osmB.center[0] : -122.080,
            areaSqm: Math.round(Number(osmB.area_m2) || 220),
            levels: osmB.levels || 1,
            heightM: osmB.height_m || 4.5,
            heightSource: osmB.height_source || 'district_zoning_default',
            targetFar: Number(((osmB.levels || 1) * 0.55).toFixed(2))
          };
        } else {
          return {
            error: `Parcel not found: ${parcelId}`,
            parcelId: null
          };
        }
      }
    } else {
      p = (twin && twin.viewport && twin.viewport.selectedParcel)
        || parcels.find((item) => item.warmLit)
        || parcels[0];
    }

    if (!p) {
      p = {
        id: 'MV-PARCEL-001',
        name: 'North Bayshore Parcel MV-PARCEL-001',
        district: 'NB_PP',
        districtName: 'North Bayshore Precise Plan',
        baseZone: 'MU6',
        currentZoneKey: 'MU6',
        currentZoneCode: 'CRA-MU6',
        lat: 37.4220,
        lon: -122.0840,
        w: 2.5,
        d: 2.5,
        areaSqm: 1125,
        targetFar: 2.8,
        units: 24,
        jobs: 40
      };
    }

    const lat = p.lat !== undefined ? p.lat : 37.3861;
    const lon = p.lon !== undefined ? p.lon : -122.0839;
    const footprintSqm = Math.round(p.areaSqm || ((p.w || 2.0) * (p.d || 2.0) * 180));
    const footprintSqft = Math.round(footprintSqm * 10.7639);

    const zoneKey = p.currentZoneKey || p.baseZone || 'MU6';
    const existingZone = p.baseZone ? (INCLUSIONARY_SPLITS[p.baseZone] ? p.baseZone : 'MU6') : 'MU6';
    const proposedZone = zoneKey;

    let canonicalDistKey = normalizeDistrictKey(p.district);
    if (!canonicalDistKey) {
      if (lon <= -122.100 && lat >= 37.399 && lat <= 37.411) {
        canonicalDistKey = 'SA_PP';
      } else {
        canonicalDistKey = 'NB_PP';
      }
    }

    const currentFar = PLANNER_DISTRICT_DEFS[canonicalDistKey]?.baselineFar || 0.60;
    const targetFar = p.targetFar || (zoneKey === 'TOD10' ? 4.5 : zoneKey === 'MU6' ? 2.8 : 1.65);

    const gfaSqm = Math.round(footprintSqm * targetFar);
    const gfaSqft = Math.round(gfaSqm * 10.7639);

    const fRes = PLANNER_DISTRICT_DEFS[canonicalDistKey]?.resShare || 0.65;

    let dwellingUnits = 0;
    let commercialJobs = 0;
    if (zoneKey === 'PARK') {
      dwellingUnits = 0;
      commercialJobs = Math.max(1, Math.round(footprintSqm * 0.0001));
    } else {
      dwellingUnits = Math.max(1, Math.round((gfaSqm * fRes) / PRO_FORMA_CONSTANTS.avgUnitAreaM2));
      commercialJobs = Math.max(1, Math.round((gfaSqm * (1.0 - fRes)) / PRO_FORMA_CONSTANTS.avgJobAreaM2));
    }

    const distDowntownM = haversineDistanceMeters(lat, lon, CALTRAIN_STATIONS.downtown.lat, CALTRAIN_STATIONS.downtown.lon);
    const distSanAntonioM = haversineDistanceMeters(lat, lon, CALTRAIN_STATIONS.sanAntonio.lat, CALTRAIN_STATIONS.sanAntonio.lon);
    const transitProximityMeters = Math.min(distDowntownM, distSanAntonioM);
    const nearestStation = distDowntownM <= distSanAntonioM ? CALTRAIN_STATIONS.downtown.name : CALTRAIN_STATIONS.sanAntonio.name;

    // CAPCOA Measure T-1 / T-6 transit-proximity VMT attenuation curve (CAPCOA Dec 2021)
    const vmtBaseReduction = CAPCOA_VMT_MODEL.maxBaseReduction * Math.exp(-transitProximityMeters / CAPCOA_VMT_MODEL.decayDistanceMeters);
    const todBonus = (zoneKey === 'TOD10') ? CAPCOA_VMT_MODEL.todBonus : 0.0;
    const clampedVmtRatio = Math.max(CAPCOA_VMT_MODEL.minReduction, Math.min(CAPCOA_VMT_MODEL.maxTotalReduction, vmtBaseReduction + todBonus));
    const vmtReductionPercent = +(clampedVmtRatio * 100).toFixed(1);

    const rates = ITE_RATES[zoneKey] || ITE_RATES.MU6;
    const unmitigatedTrips = dwellingUnits * rates.res + commercialJobs * rates.job;
    const iteNetDailyTrips = Math.round(unmitigatedTrips * (1.0 - clampedVmtRatio));

    const usableRoof = (zoneKey === 'PARK') ? 0.0 : 0.42;
    const solarPvPotentialKw = +((footprintSqm * usableRoof * 780.0 * 0.20 * 0.86) / 1000).toFixed(1);
    const solarAnnualMwh = +((solarPvPotentialKw * 1650) / 1000).toFixed(1);

    const designStormM = PRO_FORMA_CONSTANTS.designStormDepthM; // 0.75-inch storm depth (m, PLACEHOLDER)
    const precipVolumeM3 = footprintSqm * designStormM;
    const retainRatio = STORMWATER_RETENTION_FRACTIONS[zoneKey] || 0.30;
    const stormwaterRetentionM3 = +(precipVolumeM3 * retainRatio).toFixed(1);

    return {
      provenance: PROVENANCE.MODELED,
      placeholderProvenance: PROVENANCE.PLACEHOLDER,
      isStaticOsmBuilding,
      parcelId: p.id,
      buildingName: p.name || '',
      heightM: p.heightM || null,
      levels: p.levels || null,
      heightSource: p.heightSource || (isStaticOsmBuilding ? 'district_zoning_default' : 'zoning_envelope_model'),
      districtKey: canonicalDistKey,
      districtName: PLANNER_DISTRICT_DEFS[canonicalDistKey]?.name || p.districtName || 'Mountain View Planning Area',
      lat: +(Number(lat).toFixed(5)),
      lon: +(Number(lon).toFixed(5)),
      footprintSqm,
      footprintSqft,
      existingZone,
      proposedZone,
      currentFar,
      targetFar,
      gfaSqm,
      gfaSqft,
      dwellingUnits,
      commercialJobs,
      iteNetDailyTrips,
      vmtReductionPercent,
      transitProximityMeters,
      nearestStation,
      solarPvPotentialKw,
      solarAnnualMwh,
      stormwaterRetentionM3
    };
  }

  /**
   * 4. Batch Rezoning of an Entire Precise Plan District with Undo Support
   */
  function batchRezoneDistrict(districtKey, targetZoneKey) {
    const canonicalDist = normalizeDistrictKey(districtKey);
    const canonicalZone = normalizeZoneKey(targetZoneKey);

    if (!canonicalDist) {
      return {
        success: false,
        error: `Unknown district key: "${districtKey}". Expected one of: NB_PP, EW_TOD, ECR_MU, SA_PP, DT_CRA.`
      };
    }
    if (!canonicalZone) {
      return {
        success: false,
        error: `Unknown zone key: "${targetZoneKey}". Expected one of: TOD10, MU6, R3, R1, PARK.`
      };
    }

    const twin = getTwin();
    const parcels = getParcels();
    const sim = (twin && twin.simulation) || null;
    if (!sim || !sim.parcelOverrides) {
      return {
        success: false,
        error: 'Simulation engine or parcelOverrides Map not available on MountainViewTwin.'
      };
    }

    const matched = parcels.filter((p) => {
      const pk = normalizeDistrictKey(p.district);
      if (pk === canonicalDist) return true;
      if (canonicalDist === 'SA_PP' && (p.lon <= -122.100 && p.lat >= 37.399 && p.lat <= 37.411)) {
        return true;
      }
      return false;
    });

    // Save snapshot onto undo stack before mutating
    const prevOverridesSnapshot = new Map(sim.parcelOverrides);
    const prevDistrictMult = sim.districtMultipliers ? { ...sim.districtMultipliers } : {};
    _undoStack.push({
      districtKey: canonicalDist,
      targetZoneKey: canonicalZone,
      parcelOverrides: prevOverridesSnapshot,
      districtMultipliers: prevDistrictMult,
      timestamp: Date.now()
    });

    let prevUnits = 0;
    let prevJobs = 0;
    for (const p of matched) {
      prevUnits += (p.units || 0);
      prevJobs += (p.jobs || 0);
      sim.parcelOverrides.set(p.id, canonicalZone);
    }

    // Also update districtMultipliers so District Scorecards reflect the batch rezone
    if (sim.districtMultipliers) {
      const zoneMultMap = { TOD10: 1.45, MU6: 1.20, R3: 1.00, R1: 0.75, PARK: 0.25 };
      sim.districtMultipliers[canonicalDist] = zoneMultMap[canonicalZone] || 1.0;
    }

    if (twin && typeof twin.runSimulationCycle === 'function') {
      twin.runSimulationCycle('batch-rezone');
    }

    let updatedUnits = 0;
    let updatedJobs = 0;
    for (const p of matched) {
      updatedUnits += (p.units || 0);
      updatedJobs += (p.jobs || 0);
    }

    return {
      success: true,
      canUndo: _undoStack.length > 0,
      districtKey: canonicalDist,
      targetZoneKey: canonicalZone,
      parcelsModified: matched.length,
      totalDeltaUnits: updatedUnits - prevUnits,
      totalDeltaJobs: updatedJobs - prevJobs
    };
  }

  function undoLastBatchRezone() {
    if (_undoStack.length === 0) {
      return { success: false, error: 'No batch rezone action to undo.' };
    }
    const last = _undoStack.pop();
    const twin = getTwin();
    const sim = (twin && twin.simulation) || null;
    if (!sim || !sim.parcelOverrides) {
      return { success: false, error: 'Simulation engine unavailable.' };
    }
    sim.parcelOverrides.clear();
    for (const [k, v] of last.parcelOverrides.entries()) {
      sim.parcelOverrides.set(k, v);
    }
    if (sim.districtMultipliers && last.districtMultipliers) {
      Object.assign(sim.districtMultipliers, last.districtMultipliers);
    }
    if (twin && typeof twin.runSimulationCycle === 'function') {
      twin.runSimulationCycle('undo-batch-rezone');
    }
    return {
      success: true,
      restoredDistrictKey: last.districtKey,
      remainingUndoCount: _undoStack.length
    };
  }

  /**
   * 5. Baseline-vs-Scenario Delta Comparator across 12 Indicators (Bugs #4 & #5 Fixed)
   * - Uses `planningSolarMw` (computed at standard clear-sky 780 W/m² reference over Σ area_m2)
   *   so weather fluctuations never masquerade as planning deltas.
   * - Uses bilinear SRTM elevation flood count (`0` at Baseline) so Baseline shows `0` delta on all 12 rows.
   */
  function getScenarioComparison() {
    const twin = getTwin();
    const snap = getSnapshot();
    const sim = (twin && twin.simulation) || null;
    const activeId = snap.scenarioId || (sim && sim.activeScenarioId) || 'baseline';
    const scenarioNames = {
      baseline: '2026 Official Baseline',
      bayshore: 'North Bayshore Complete Community',
      elcamino: 'El Camino Grand Blvd & Castro TOD',
      eastwhisman: 'East Whisman & Downtown Intensification',
      whisman: 'East Whisman & Downtown Intensification',
      sponge: 'Net-Zero Sponge City 2040',
      custom: 'Custom Planner Scenario'
    };
    const activeName = scenarioNames[activeId] || (activeId.charAt(0).toUpperCase() + activeId.slice(1));
    const rhna = getRhnaTierBreakdown();

    // Baseline reference solar MW is the twin's computed baseline planningSolarMw (at FAR=2.4, canopy=16.4%, GHI=780 W/m²)
    const baselinePlanningSolarMw = (snap.baselinePlanningSolarMw !== undefined)
      ? Number(snap.baselinePlanningSolarMw)
      : 212.3;
    const baselineFloodParcels = (snap.baselineFloodParcels !== undefined)
      ? Number(snap.baselineFloodParcels)
      : 0;

    const BASELINE = {
      netAddedUnits: 0,
      rhnaProgressPct: 0.0,
      commercialJobs: 109600,
      jobsHousingRatio: 2.90,
      us101Vc: 0.88,
      us101Los: 'D',
      ecrVc: 0.64,
      ecrLos: 'B',
      transitModeShare: 25.0,
      cleanSolarMw: +baselinePlanningSolarMw.toFixed(1),
      treeCanopyPct: 16.4,
      floodExposedParcels: baselineFloodParcels,
      iteNetDailyTrips: 371310,
      transitVmtReductionPct: 22.4
    };

    const activeNetUnits = snap.rhnaDelta !== undefined ? snap.rhnaDelta : Math.max(0, (snap.housingUnits || 37800) - 37800);
    const activeRhnaPct = rhna.percentComplete;
    const activeJobs = snap.jobs || 109600;
    const activeJhRatio = snap.jobsHousingRatio !== undefined ? snap.jobsHousingRatio : +(activeJobs / Math.max(1, snap.housingUnits || 37800)).toFixed(2);

    const raw101 = snap.corridors && snap.corridors.us101;
    const active101Vc = +(raw101 ? (raw101.vc !== undefined ? raw101.vc : 0.88) : 0.88).toFixed(2);
    const active101Los = String(raw101 && raw101.los ? raw101.los : 'D').replace('LOS ', '');

    const rawEcr = snap.corridors && snap.corridors.ecr;
    const activeEcrVc = +(rawEcr ? (rawEcr.vc !== undefined ? rawEcr.vc : 0.64) : 0.64).toFixed(2);
    const activeEcrLos = String(rawEcr && rawEcr.los ? rawEcr.los : 'B').replace('LOS ', '');

    const activeTransitShare = +(snap.transitShare !== undefined ? snap.transitShare : 25.0).toFixed(1);
    // Bug #5 Fix: Compare planningSolarMw (standardized clear-sky planning capacity) against baselinePlanningSolarMw
    const activeSolarMw = +(snap.planningSolarMw !== undefined ? snap.planningSolarMw : baselinePlanningSolarMw).toFixed(1);
    const activeCanopyPct = +(snap.greenspacePct !== undefined ? snap.greenspacePct : 16.4).toFixed(1);
    const activeFloodParcels = (snap.flood && snap.flood.inundatedBuildingCount !== undefined)
      ? snap.flood.inundatedBuildingCount
      : 0;

    const unmitigatedTrips = Math.round((snap.housingUnits || 37800) * 4.54 + activeJobs * 2.80);
    const transitMitigationFactor = Math.min(0.42, 0.224 * (1 + (activeTransitShare - 25.0) / 100 * 1.25));
    const activeNetTrips = Math.round(unmitigatedTrips * (1 - transitMitigationFactor));
    const activeVmtRedPct = +(Math.min(42.0, Math.max(5.0, 22.4 * (1 + (activeTransitShare - 25.0) / 100 * 0.85)))).toFixed(1);

    const fmtSigned = (val, decimals = 0, suffix = '') => {
      const num = Number(val);
      if (Number.isNaN(num)) return String(val);
      const cleanNum = Math.abs(num) < 1e-6 ? 0 : num;
      const sign = cleanNum > 0 ? '+' : '';
      const formatted = decimals > 0 ? cleanNum.toFixed(decimals) : cleanNum.toLocaleString();
      return `${sign}${formatted}${suffix}`;
    };

    const deltaUnits = activeNetUnits - BASELINE.netAddedUnits;
    const deltaRhna = +(activeRhnaPct - BASELINE.rhnaProgressPct).toFixed(1);
    const deltaJobs = activeJobs - BASELINE.commercialJobs;
    const deltaJh = +(activeJhRatio - BASELINE.jobsHousingRatio).toFixed(2);
    const delta101Vc = +(active101Vc - BASELINE.us101Vc).toFixed(2);
    const deltaEcrVc = +(activeEcrVc - BASELINE.ecrVc).toFixed(2);
    const deltaTransit = +(activeTransitShare - BASELINE.transitModeShare).toFixed(1);
    const deltaSolar = +(activeSolarMw - BASELINE.cleanSolarMw).toFixed(1);
    const deltaCanopy = +(activeCanopyPct - BASELINE.treeCanopyPct).toFixed(1);
    const deltaFlood = activeFloodParcels - BASELINE.floodExposedParcels;
    const deltaTrips = activeNetTrips - BASELINE.iteNetDailyTrips;
    const deltaVmtRed = +(activeVmtRedPct - BASELINE.transitVmtReductionPct).toFixed(1);

    const indicators = [
      {
        key: 'net_added_units',
        label: 'Total Net Added Units',
        baseline: BASELINE.netAddedUnits,
        active: activeNetUnits,
        deltaNum: deltaUnits,
        delta: fmtSigned(deltaUnits),
        unit: 'units',
        provenance: PROVENANCE.MODELED,
        status: activeNetUnits >= 11135 ? 'Mandate Met' : (activeNetUnits > 0 ? 'On Track' : 'Baseline')
      },
      {
        key: 'rhna_progress_pct',
        label: 'RHNA % Progress',
        baseline: `${BASELINE.rhnaProgressPct.toFixed(1)}%`,
        active: `${activeRhnaPct}%`,
        deltaNum: deltaRhna,
        delta: fmtSigned(deltaRhna, 1, '%'),
        unit: '%',
        provenance: PROVENANCE.MODELED,
        status: activeRhnaPct >= 100.0 ? '100% Target Reached' : `${activeRhnaPct}% of 11,135`
      },
      {
        key: 'commercial_jobs',
        label: 'Total Commercial Jobs',
        baseline: BASELINE.commercialJobs,
        active: activeJobs,
        deltaNum: deltaJobs,
        delta: fmtSigned(deltaJobs),
        unit: 'jobs',
        provenance: PROVENANCE.MODELED,
        status: deltaJobs > 0 ? 'Employment Growth' : 'Baseline'
      },
      {
        key: 'jobs_housing_ratio',
        label: 'Jobs-to-Housing Balance Ratio',
        baseline: `${BASELINE.jobsHousingRatio.toFixed(2)}:1`,
        active: `${activeJhRatio}:1`,
        deltaNum: deltaJh,
        delta: `${fmtSigned(deltaJh, 2)}:1`,
        unit: 'ratio',
        provenance: PROVENANCE.MODELED,
        status: activeJhRatio <= 1.5 ? 'Balanced Community' : (activeJhRatio < 2.9 ? 'Improved Balance' : 'Baseline')
      },
      {
        key: 'us101_vc_los',
        label: 'US-101 Corridor V/C & LOS (BPR Model)',
        baseline: `${BASELINE.us101Vc.toFixed(2)} (LOS ${BASELINE.us101Los})`,
        active: `${active101Vc.toFixed(2)} (LOS ${active101Los})`,
        deltaNum: delta101Vc,
        delta: `${fmtSigned(delta101Vc, 2)} (${active101Los} vs LOS ${BASELINE.us101Los})`,
        unit: 'V/C ratio',
        provenance: PROVENANCE.MODELED,
        status: delta101Vc < 0 ? 'Congestion Mitigated' : (delta101Vc === 0 ? 'Baseline Flow' : 'Higher Load')
      },
      {
        key: 'ecr_vc_los',
        label: 'El Camino Real V/C & LOS (BPR Model)',
        baseline: `${BASELINE.ecrVc.toFixed(2)} (LOS ${BASELINE.ecrLos})`,
        active: `${activeEcrVc.toFixed(2)} (LOS ${activeEcrLos})`,
        deltaNum: deltaEcrVc,
        delta: `${fmtSigned(deltaEcrVc, 2)} (${activeEcrLos} vs LOS ${BASELINE.ecrLos})`,
        unit: 'V/C ratio',
        provenance: PROVENANCE.MODELED,
        status: activeEcrLos === 'A' || activeEcrLos === 'B' ? 'Moderate Arterial Flow' : 'Elevated Load'
      },
      {
        key: 'transit_mode_share',
        label: 'Transit / Sustainable Mode Share %',
        baseline: `${BASELINE.transitModeShare.toFixed(1)}%`,
        active: `${activeTransitShare}%`,
        deltaNum: deltaTransit,
        delta: fmtSigned(deltaTransit, 1, '%'),
        unit: '%',
        provenance: PROVENANCE.MODELED,
        status: activeTransitShare >= 45.0 ? 'High Transit Mode Share' : (deltaTransit === 0 ? 'Baseline' : 'Progressing')
      },
      {
        key: 'clean_solar_mw',
        label: 'Rooftop Solar PV Capacity (MW, Clear-Sky Ref)',
        baseline: `${BASELINE.cleanSolarMw.toFixed(1)} MW`,
        active: `${activeSolarMw.toFixed(1)} MW`,
        deltaNum: deltaSolar,
        delta: `${fmtSigned(deltaSolar, 1)} MW`,
        unit: 'MW',
        provenance: PROVENANCE.MODELED,
        status: deltaSolar > 0 ? 'Expanded Rooftop Capacity' : 'Baseline Rooftop Capacity'
      },
      {
        key: 'tree_canopy_pct',
        label: 'Urban Tree Canopy Coverage %',
        baseline: `${BASELINE.treeCanopyPct.toFixed(1)}%`,
        active: `${activeCanopyPct}%`,
        deltaNum: deltaCanopy,
        delta: fmtSigned(deltaCanopy, 1, '%'),
        unit: '%',
        provenance: PROVENANCE.MODELED,
        status: activeCanopyPct >= 25.0 ? 'Meets 25% Canopy Target' : 'Baseline Canopy'
      },
      {
        key: 'flood_exposed_parcels',
        label: 'Storm Surge Flood-Exposed Buildings (SRTM DEM)',
        baseline: BASELINE.floodExposedParcels,
        active: activeFloodParcels,
        deltaNum: deltaFlood,
        delta: fmtSigned(deltaFlood),
        unit: 'buildings',
        provenance: PROVENANCE.MODELED,
        status: activeFloodParcels === 0 ? 'Zero Surge Inundation' : `${activeFloodParcels} Buildings Below Surge Level`
      },
      {
        key: 'ite_net_daily_trips',
        label: 'Modeled Net Daily Vehicle Trips (ITE)',
        baseline: BASELINE.iteNetDailyTrips,
        active: activeNetTrips,
        deltaNum: deltaTrips,
        delta: fmtSigned(deltaTrips),
        unit: 'trips/day',
        provenance: PROVENANCE.MODELED,
        status: deltaTrips < 0 ? 'Net Trips Reduced' : (deltaTrips === 0 ? 'Baseline' : 'Managed Trip Growth')
      },
      {
        key: 'transit_vmt_reduction_pct',
        label: 'Modeled Transit Proximity VMT Reduction %',
        baseline: `${BASELINE.transitVmtReductionPct.toFixed(1)}%`,
        active: `${activeVmtRedPct}%`,
        deltaNum: deltaVmtRed,
        delta: fmtSigned(deltaVmtRed, 1, '%'),
        unit: '%',
        provenance: PROVENANCE.MODELED,
        status: activeVmtRedPct >= 30.0 ? 'High-Efficiency TOD' : 'Baseline TDM'
      }
    ];

    const indicatorMap = {};
    for (const ind of indicators) {
      indicatorMap[ind.key] = ind;
    }

    return {
      provenance: PROVENANCE.MODELED,
      activeScenario: activeId,
      activeScenarioName: activeName,
      baselineScenario: 'baseline',
      baselineScenarioName: '2026 Official Baseline',
      timestamp: new Date().toISOString(),
      indicators,
      indicatorMap
    };
  }

  /**
   * 6. Export Structured Planning Report (JSON or Markdown)
   * Honesty Pass (Section 1): Exports strictly what was computed with explicit provenance chips
   * (`LIVE` | `CACHED` | `MODELED` | `FALLBACK CONSTANT`), without asserting unverified legal
   * or SCVURPPP C.3 regulatory compliance.
   */
  function exportPlanningReport(format = 'json') {
    const snap = getSnapshot();
    const rhna = getRhnaTierBreakdown();
    const scorecards = getDistrictScorecards();
    const comparison = getScenarioComparison();
    const timestamp = new Date().toISOString();
    const twin = getTwin();
    const sim = (twin && twin.simulation) || null;
    const activeId = snap.scenarioId || (sim && sim.activeScenarioId) || 'baseline';
    const activeScenarioName = comparison.activeScenarioName;

    if (String(format).toLowerCase() === 'markdown') {
      let md = `# CITY OF MOUNTAIN VIEW — URBAN PLANNING SCENARIO REPORT\n`;
      md += `**ABAG 6th Cycle (2023–2031) RHNA & Precise Plan Scenario Model**\n\n`;
      md += `- **Generated**: ${timestamp}\n`;
      md += `- **Active Scenario**: ${activeScenarioName} (\`${activeId}\`)\n`;
      md += `- **Data & Model Provenance**: OpenStreetMap (ODbL) building footprints, Copernicus DEM / SRTM 90m elevation grid, live/cached Open-Meteo & NOAA CO-OPS 9414523 telemetry, and illustrative deterministic planning formulas (\`MODELED\`).\n\n`;
      md += `---\n\n`;

      md += `## 1. RHNA 6th Cycle Allocation Summary (\`MODELED\`)\n`;
      md += `- **Total Modeled Housing Units**: **${snap.housingUnits ? snap.housingUnits.toLocaleString() : '37,800'} units** (Net Added: **+${rhna.currentNetUnits.toLocaleString()} units**)\n`;
      md += `- **Share of 11,135-Unit ABAG Target**: **${rhna.percentComplete}%**\n`;
      const lowerIncomeUnits = rhna.tiers.veryLow.units + rhna.tiers.low.units;
      const lowerIncomePct = +((lowerIncomeUnits / (RHNA_MANDATES.veryLow + RHNA_MANDATES.low)) * 100).toFixed(1);
      md += `- **Lower-Income Allocation (<80% AMI)**: **+${lowerIncomeUnits.toLocaleString()} / ${(RHNA_MANDATES.veryLow + RHNA_MANDATES.low).toLocaleString()} units (${lowerIncomePct}%)**\n`;
      md += `- **Modeled Inclusionary Share**: **${rhna.effectiveInclusionaryRate}%**\n\n`;

      md += `| Income Tier | AMI Definition | ABAG 6th-Cycle Target | Modeled Units | % of Target | Provenance |\n`;
      md += `|---|---|---|---|---|---|\n`;
      md += `| **Very Low Income** | <50% AMI | 2,773 units | ${rhna.tiers.veryLow.units.toLocaleString()} units | ${rhna.tiers.veryLow.percent}% | \`MODELED\` |\n`;
      md += `| **Low Income** | 50–80% AMI | 1,597 units | ${rhna.tiers.low.units.toLocaleString()} units | ${rhna.tiers.low.percent}% | \`MODELED\` |\n`;
      md += `| **Moderate Income** | 80–120% AMI | 1,885 units | ${rhna.tiers.moderate.units.toLocaleString()} units | ${rhna.tiers.moderate.percent}% | \`MODELED\` |\n`;
      md += `| **Above Moderate Income** | >120% AMI | 4,880 units | ${rhna.tiers.aboveModerate.units.toLocaleString()} units | ${rhna.tiers.aboveModerate.percent}% | \`MODELED\` |\n`;
      md += `| **TOTAL** | All Incomes | **11,135 units** | **${rhna.currentNetUnits.toLocaleString()} units** | **${rhna.percentComplete}%** | \`MODELED\` |\n\n`;

      md += `## 2. Precise Plan District Scorecards (\`MODELED\`)\n`;
      md += `| District Name | OSM Buildings | Footprint Area | Multiplier | Target FAR | Net Added Units | Net Added Jobs | Jobs/Housing |\n`;
      md += `|---|---|---|---|---|---|---|---|\n`;
      for (const s of Object.values(scorecards)) {
        md += `| **${s.name}** | ${s.parcelCount.toLocaleString()} | ${s.totalFootprintSqm.toLocaleString()} m² (${s.totalFootprintAcres} ac) | ${s.multiplier}x | ${s.targetFar} | +${s.netAddedUnits.toLocaleString()} | +${s.netAddedJobs.toLocaleString()} | ${s.jobsHousingRatio}:1 |\n`;
      }

      md += `\n## 3. Baseline vs. Active Scenario Comparison (\`MODELED\`)\n`;
      md += `| Indicator | 2026 Baseline | Active Scenario | Delta | Provenance |\n`;
      md += `|---|---|---|---|---|\n`;
      for (const ind of comparison.indicators) {
        md += `| ${ind.label} | ${ind.baseline} | ${ind.active} | **${ind.delta}** | \`${ind.provenance}\` |\n`;
      }

      return md;
    }

    return {
      metadata: {
        jurisdiction: 'City of Mountain View',
        county: 'Santa Clara County',
        planningPeriod: '6th Cycle (2023–2031)',
        reportId: `MV-PLAN-${Date.now()}`,
        generatedAt: timestamp,
        modelEngine: 'Mountain View 3D Digital Twin (Client-Side Deterministic Models)',
        provenanceSummary: {
          geometry: 'OpenStreetMap contributors (ODbL)',
          elevation: 'Copernicus DEM GLO-90 / NASA SRTM 90m via Open-Meteo Elevation API',
          weather: snap.weatherProvenance || PROVENANCE.FALLBACK_CONSTANT,
          tide: snap.tideProvenance || PROVENANCE.FALLBACK_CONSTANT,
          planningMetrics: PROVENANCE.MODELED
        }
      },
      activeScenario: {
        id: activeId,
        name: activeScenarioName,
        summary: 'Illustrative zoning & Precise Plan scenario comparison against 2026 Baseline.'
      },
      rhnaAllocation: {
        provenance: PROVENANCE.MODELED,
        totalTarget: RHNA_MANDATES.targetTotal,
        netUnitsAdded: rhna.currentNetUnits,
        totalProgressPct: rhna.percentComplete,
        lowerIncomeTarget: RHNA_MANDATES.veryLow + RHNA_MANDATES.low,
        lowerIncomeUnits: rhna.tiers.veryLow.units + rhna.tiers.low.units,
        effectiveInclusionaryRate: rhna.effectiveInclusionaryRate,
        tiers: {
          veryLow: {
            target: RHNA_MANDATES.veryLow,
            units: rhna.tiers.veryLow.units,
            progressPct: rhna.tiers.veryLow.percent,
            amiRange: '<50% AMI'
          },
          low: {
            target: RHNA_MANDATES.low,
            units: rhna.tiers.low.units,
            progressPct: rhna.tiers.low.percent,
            amiRange: '50–80% AMI'
          },
          moderate: {
            target: RHNA_MANDATES.moderate,
            units: rhna.tiers.moderate.units,
            progressPct: rhna.tiers.moderate.percent,
            amiRange: '80–120% AMI'
          },
          aboveModerate: {
            target: RHNA_MANDATES.aboveModerate,
            units: rhna.tiers.aboveModerate.units,
            progressPct: rhna.tiers.aboveModerate.percent,
            amiRange: '>120% AMI'
          }
        }
      },
      districtScorecards: Object.values(scorecards),
      baselineScenarioDelta: {
        provenance: PROVENANCE.MODELED,
        activeScenario: activeId,
        baselineScenario: 'baseline',
        indicators: comparison.indicators
      },
      transportationModel: {
        provenance: PROVENANCE.MODELED,
        formula: 'Bureau of Public Roads (1964) T = T0 * (1 + 0.15 * (V/C)^4) and ITE 11th Ed. illustrative trip rates',
        dailyBaselineTrips: comparison.indicatorMap?.ite_net_daily_trips?.baseline || 371310,
        dailyModeledNetTrips: comparison.indicatorMap?.ite_net_daily_trips?.active || 371310,
        transitProximityVmtReductionPct: comparison.indicatorMap?.transit_vmt_reduction_pct?.active || 22.4,
        corridors: {
          us101: snap.corridors?.us101 || { vc: 0.88, los: 'LOS D' },
          elCaminoReal: snap.corridors?.ecr || { vc: 0.64, los: 'LOS B' }
        }
      },
      environmentalMetrics: {
        provenance: PROVENANCE.MODELED,
        rooftopSolarCapacityMwClearSkyRef: snap.planningSolarMw || 212.3,
        liveSolarGenerationMw: snap.solarMw !== undefined ? snap.solarMw : 212.3,
        urbanTreeCanopyPct: snap.greenspacePct || 16.4,
        urbanHeatIslandDeltaC: snap.uhiDelta || 0.0,
        stormwaterRunoffRetentionEstimatePct: 30.0,
        seaLevelRiseSurgeM: (sim && sim.params && sim.params.baySurge) || 0.0,
        floodExposedBuildingsCount: snap.flood?.inundatedBuildingCount || 0,
        floodedLandAreaKm2: snap.flood?.inundatedAreaKm2 || 0.0
      }
    };
  }

  return {
    getRhnaTierBreakdown,
    getDistrictScorecards,
    getParcelProForma,
    batchRezoneDistrict,
    applyZoneToDistrict: batchRezoneDistrict,
    undoLastBatchRezone,
    getScenarioComparison,
    exportPlanningReport
  };
}

if (typeof window !== 'undefined') {
  window.createPlannerUtility = createPlannerUtility;
}
