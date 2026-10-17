/**
 * Mountain View Digital Twin - City Planner Utility & Decision-Support Suite
 * mv-planner-utility.js
 *
 * Implements deterministic urban planning calculations:
 * - California HCD 6th Cycle RHNA income-tier progress (11,135 unit target)
 * - 5 Mountain View Precise Plan district scorecards
 * - Parcel-level pro-forma envelope, ITE daily trip generation & CAPCOA VMT reduction
 * - Rooftop solar PV potential (Title 24) & SCVURPPP C.3 stormwater retention
 * - Precise Plan district batch-rezoning
 * - 12-indicator scenario delta comparison & exportable planning reports
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const utility = factory();
    root.createPlannerUtility = utility.createPlannerUtility;
    if (root.MountainViewTwin) {
      root.MountainViewTwin.plannerUtility = utility.createPlannerUtility(root.MountainViewTwin);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Statutory California HCD 6th Cycle RHNA Mandates (2023-2031)
  const RHNA_MANDATES = {
    targetTotal: 11135,
    veryLow: 2773,      // <50% AMI
    low: 1599,          // 50-80% AMI
    moderate: 1885,     // 80-120% AMI
    aboveModerate: 4878 // >120% AMI (Market)
  };

  // Mountain View City Code Ch. 36 Affordability Vectors by Zoning Code
  const INCLUSIONARY_SPLITS = {
    TOD10:  { veryLow: 0.15, low: 0.10, moderate: 0.10, aboveModerate: 0.65 },
    MU6:    { veryLow: 0.10, low: 0.08, moderate: 0.07, aboveModerate: 0.75 },
    R3:     { veryLow: 0.05, low: 0.05, moderate: 0.10, aboveModerate: 0.80 },
    R1:     { veryLow: 0.00, low: 0.10, moderate: 0.30, aboveModerate: 0.60 },
    PARK:   { veryLow: 0.00, low: 0.00, moderate: 0.00, aboveModerate: 0.00 }
  };

  // 5 Mountain View Precise Plan District Definitions & Defaults
  const PRECISE_PLAN_DISTRICTS = {
    NB_PP: {
      name: 'North Bayshore Precise Plan',
      code: 'NB-P',
      baselineFar: 0.40,
      targetFar: 3.20,
      resShare: 0.65,
      baselineUnits: 2800,
      baselineJobs: 48200,
      defaultFootprintM2: 781977,
      defaultBuildingCount: 920,
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
      defaultFootprintM2: 420945,
      defaultBuildingCount: 1277,
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
      defaultFootprintM2: 348945,
      defaultBuildingCount: 1540,
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
      defaultFootprintM2: 222415,
      defaultBuildingCount: 566,
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
      defaultFootprintM2: 71860,
      defaultBuildingCount: 771,
      gisName: 'Downtown Castro'
    }
  };

  // Passenger Rail Caltrain Station Coordinates
  const CALTRAIN_STATIONS = {
    downtown: {
      name: 'Downtown Mountain View Caltrain',
      lat: 37.39434,
      lon: -122.07588
    },
    sanAntonio: {
      name: 'San Antonio Caltrain',
      lat: 37.40741,
      lon: -122.10724
    }
  };

  // ITE 11th Edition Trip Generation Rates
  const ITE_RATES = {
    R1:    { res: 9.44, job: 2.80 },
    R3:    { res: 5.44, job: 2.50 },
    MU6:   { res: 4.54, job: 2.20 },
    TOD10: { res: 3.80, job: 1.80 },
    PARK:  { res: 0.00, job: 0.20 }
  };

  // SCVURPPP Stormwater Runoff Retention Fractions (0.75-inch storm)
  const STORMWATER_RETENTION_FRACTIONS = {
    PARK:  0.90,
    R1:    0.55,
    R3:    0.40,
    MU6:   0.30,
    TOD10: 0.25
  };

  /**
   * Calculate Haversine surface distance in meters between two lat/lon points.
   */
  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
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

  /**
   * Normalize arbitrary district key or alias to canonical Precise Plan district key.
   */
  function normalizeDistrictKey(rawKey) {
    if (!rawKey) return null;
    const k = String(rawKey).trim().toLowerCase();
    if (k === 'nb_pp' || k === 'nb' || k === 'nb-p' || k.includes('bayshore')) return 'NB_PP';
    if (k === 'ew_tod' || k === 'ew' || k === 'ew-p' || k.includes('whisman')) return 'EW_TOD';
    if (k === 'sa_pp' || k === 'sa_tod' || k === 'sa' || k === 'sa-p' || k.includes('antonio')) return 'SA_PP';
    if (k === 'dt_cra' || k === 'dt' || k === 'dt-p' || k.includes('castro') || k.includes('downtown')) return 'DT_CRA';
    if (k === 'ecr_mu' || k === 'ecr' || k === 'ecr-p' || k.includes('camino')) return 'ECR_MU';
    return null;
  }

  /**
   * Normalize arbitrary zone code or alias to canonical zone key.
   */
  function normalizeZoneKey(rawKey) {
    if (!rawKey) return null;
    const k = String(rawKey).trim().toUpperCase();
    if (k === 'TOD10' || k === 'TOD-10' || k === 'TOD') return 'TOD10';
    if (k === 'MU6' || k === 'CRA-MU6' || k === 'CRA-MU' || k === 'MU' || k === 'CRA') return 'MU6';
    if (k === 'R3' || k === 'R-3' || k === 'R-3 MID') return 'R3';
    if (k === 'R1' || k === 'R-1' || k === 'R-1 LOW') return 'R1';
    if (k === 'PARK' || k === 'OS-ECO' || k === 'ECO') return 'PARK';
    return null;
  }

  /**
   * Factory function creating the Mountain View City Planner Utility.
   * Backed deterministically by twinInstance state.
   */
  function createPlannerUtility(twinInstance) {
    let _twin = twinInstance || null;
    function getTwin() {
      if (_twin) return _twin;
      if (typeof window !== 'undefined' && window.MountainViewTwin) {
        _twin = window.MountainViewTwin;
        return _twin;
      }
      return null;
    }

    /**
     * Helper to retrieve live telemetry snapshot.
     */
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
        solarMw: 154,
        greenspacePct: 16.4,
        uhiDelta: 0.0,
        corridors: {
          us101: { vc: 0.88, los: 'D', label: '0.88 / High' },
          ecr: { vc: 0.64, los: 'B', label: '0.64 / Moderate' }
        },
        flood: { inundatedBuildingCount: 0 }
      };
    }

    /**
     * Helper to retrieve active parcel records array.
     */
    function getParcels() {
      const twin = getTwin();
      if (twin && twin.viewport && Array.isArray(twin.viewport.parcelRecords)) {
        return twin.viewport.parcelRecords;
      }
      return [];
    }

    /**
     * R1.1: 6th Cycle RHNA Income-Tier Breakdown (11,135 target)
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

      // Integer parity allocation
      const vlUnits = Math.round(netUnits * normVl);
      const lUnits = Math.round(netUnits * normL);
      const modUnits = Math.round(netUnits * normMod);
      const aboveUnits = Math.max(0, netUnits - (vlUnits + lUnits + modUnits));

      return {
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
     * R1.2: 5 Precise Plan District Scorecards
     */
    function getDistrictScorecards() {
      const twin = getTwin();
      const gisData = (twin && twin.viewport && twin.viewport.mvGisData) || null;
      const buildings = (gisData && Array.isArray(gisData.buildings)) ? gisData.buildings : [];
      const sim = (twin && twin.simulation) || null;
      const farCap = (sim && sim.params && sim.params.farCap) || 2.4;
      const farFactor = farCap / 2.4;

      const scorecards = {};

      for (const [districtKey, def] of Object.entries(PRECISE_PLAN_DISTRICTS)) {
        const matched = buildings.filter((b) => b.district === def.gisName);
        let footprintSqm = 0;
        for (const b of matched) {
          footprintSqm += (b.area_m2 || 0);
        }
        if (footprintSqm === 0) {
          footprintSqm = def.defaultFootprintM2;
        }

        const parcelCount = matched.length > 0 ? matched.length : def.defaultBuildingCount;
        const totalFootprintAcres = +(footprintSqm / 4046.8564).toFixed(2);

        const distMult = (sim && sim.districtMultipliers && sim.districtMultipliers[def.gisName]) || 1.0;
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
          name: def.name,
          code: def.code,
          parcelCount,
          totalFootprintSqm: Math.round(footprintSqm),
          totalFootprintAcres,
          currentFar,
          targetFar,
          netAddedUnits,
          netAddedJobs,
          jobsHousingRatio,
          rhnaContributionPercent
        };
      }

      return scorecards;
    }

    /**
     * R2.1: Parcel Pro-Forma Envelope & Impact Inspector
     */
    function getParcelProForma(parcelId) {
      const twin = getTwin();
      const parcels = getParcels();
      let p = null;

      if (parcelId !== undefined && parcelId !== null) {
        p = parcels.find((item) => String(item.id) === String(parcelId));
        if (!p) {
          return {
            error: `Parcel not found: ${parcelId}`,
            parcelId: null
          };
        }
      } else {
        p = parcels.find((item) => item.warmLit || item === twin?.viewport?.selectedParcel) || parcels[0];
      }

      if (!p) {
        p = {
          id: 'MV-PARCEL-001',
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
      const footprintSqm = p.areaSqm || Math.round((p.w || 2.0) * (p.d || 2.0) * 180);
      const footprintSqft = Math.round(footprintSqm * 10.7639);

      const zoneKey = p.currentZoneKey || p.baseZone || 'MU6';
      const existingZone = p.baseZone ? (INCLUSIONARY_SPLITS[p.baseZone] ? p.baseZone : 'MU6') : 'MU6';
      const proposedZone = zoneKey;

      const currentFar = PRECISE_PLAN_DISTRICTS[p.district]?.baselineFar || 0.60;
      const targetFar = p.targetFar || (zoneKey === 'TOD10' ? 4.5 : zoneKey === 'MU6' ? 2.8 : 1.65);

      const gfaSqm = Math.round(footprintSqm * targetFar);
      const gfaSqft = Math.round(gfaSqm * 10.7639);

      let fRes = 0.65;
      let canonicalDistKey = normalizeDistrictKey(p.district);
      if (!canonicalDistKey) {
        if (lon <= -122.100 && lat >= 37.399 && lat <= 37.411) {
          canonicalDistKey = 'SA_PP';
        } else {
          canonicalDistKey = 'NB_PP';
        }
      }
      if (PRECISE_PLAN_DISTRICTS[canonicalDistKey]) {
        fRes = PRECISE_PLAN_DISTRICTS[canonicalDistKey].resShare;
      }

      let dwellingUnits = 0;
      let commercialJobs = 0;

      if (zoneKey === 'PARK') {
        dwellingUnits = 0;
        commercialJobs = Math.max(1, Math.round(footprintSqm * 0.0001));
      } else {
        dwellingUnits = Math.max(1, Math.round((gfaSqm * fRes) / 85.0));
        commercialJobs = Math.max(1, Math.round((gfaSqm * (1.0 - fRes)) / 26.0));
      }

      // Caltrain Station Proximity
      const distDowntownM = haversineDistanceMeters(lat, lon, CALTRAIN_STATIONS.downtown.lat, CALTRAIN_STATIONS.downtown.lon);
      const distSanAntonioM = haversineDistanceMeters(lat, lon, CALTRAIN_STATIONS.sanAntonio.lat, CALTRAIN_STATIONS.sanAntonio.lon);
      const transitProximityMeters = Math.min(distDowntownM, distSanAntonioM);
      const nearestStation = distDowntownM <= distSanAntonioM ? CALTRAIN_STATIONS.downtown.name : CALTRAIN_STATIONS.sanAntonio.name;

      // CAPCOA LUT-1/4 VMT Reduction Model
      const vmtBaseReduction = 0.38 * Math.exp(-transitProximityMeters / 1100);
      const todBonus = (zoneKey === 'TOD10') ? 0.04 : 0.0;
      const clampedVmtRatio = Math.max(0.05, Math.min(0.42, vmtBaseReduction + todBonus));
      const vmtReductionPercent = +(clampedVmtRatio * 100).toFixed(1);

      // ITE Trip Generation
      const rates = ITE_RATES[zoneKey] || ITE_RATES.MU6;
      const unmitigatedTrips = dwellingUnits * rates.res + commercialJobs * rates.job;
      const iteNetDailyTrips = Math.round(unmitigatedTrips * (1.0 - clampedVmtRatio));

      // Title 24 Solar PV Potential
      const usableRoof = (zoneKey === 'PARK') ? 0.0 : 0.65;
      const solarPvPotentialKw = +((footprintSqm * usableRoof * 780.0 * 0.20 * 0.80) / 1000).toFixed(1);
      const solarAnnualMwh = +((solarPvPotentialKw * 1650) / 1000).toFixed(1);

      // SCVURPPP Stormwater Retention
      const designStormM = 0.01905; // 0.75 inches
      const precipVolumeM3 = footprintSqm * designStormM;
      const retainRatio = STORMWATER_RETENTION_FRACTIONS[zoneKey] || 0.30;
      const stormwaterRetentionM3 = +(precipVolumeM3 * retainRatio).toFixed(1);

      return {
        parcelId: p.id,
        districtKey: canonicalDistKey,
        districtName: PRECISE_PLAN_DISTRICTS[canonicalDistKey]?.name || p.districtName || 'Mountain View Planning Area',
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
     * R2.1: Apply Zone to Entire Precise Plan District (Batch Rezoning)
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

      // Match parcels in district
      const matched = parcels.filter((p) => {
        const pk = normalizeDistrictKey(p.district);
        if (pk === canonicalDist) return true;
        if (canonicalDist === 'SA_PP' && (p.lon <= -122.100 && p.lat >= 37.399 && p.lat <= 37.411)) {
          return true;
        }
        return false;
      });

      let prevUnits = 0;
      let prevJobs = 0;
      for (const p of matched) {
        prevUnits += (p.units || 0);
        prevJobs += (p.jobs || 0);
        sim.parcelOverrides.set(p.id, canonicalZone);
      }

      // Trigger twin simulation cycle
      if (twin && typeof twin.runSimulationCycle === 'function') {
        twin.runSimulationCycle('batch-rezone');
      }

      let updatedUnits = 0;
      let updatedJobs = 0;
      for (const p of matched) {
        updatedUnits += (p.units || 0);
        updatedJobs += (p.jobs || 0);
      }

      const deltaU = updatedUnits - prevUnits;
      const deltaJ = updatedJobs - prevJobs;

      return {
        success: true,
        districtKey: canonicalDist,
        targetZoneKey: canonicalZone,
        parcelsModified: matched.length,
        totalDeltaUnits: deltaU,
        totalDeltaJobs: deltaJ
      };
    }

    /**
     * R2.2: Baseline-vs-Scenario Delta Comparator across 12 Indicators
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
        cleanSolarMw: 154.0,
        treeCanopyPct: 16.4,
        floodExposedParcels: 0,
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
      const activeSolarMw = +(snap.solarMw !== undefined ? snap.solarMw : 154.0).toFixed(1);
      const activeCanopyPct = +(snap.greenspacePct !== undefined ? snap.greenspacePct : 16.4).toFixed(1);
      const activeFloodParcels = (snap.flood && snap.flood.inundatedBuildingCount !== undefined) ? snap.flood.inundatedBuildingCount : 0;

      // Indicator 11: ITE Net Daily Vehicle Trips (Macro Calibrated)
      const unmitigatedTrips = Math.round((snap.housingUnits || 37800) * 4.54 + activeJobs * 2.80);
      const transitMitigationFactor = Math.min(0.42, 0.224 * (1 + (activeTransitShare - 25.0) / 100 * 1.25));
      const activeNetTrips = Math.round(unmitigatedTrips * (1 - transitMitigationFactor));

      // Indicator 12: Transit Proximity VMT Reduction %
      const activeVmtRedPct = +(Math.min(42.0, Math.max(5.0, 22.4 * (1 + (activeTransitShare - 25.0) / 100 * 0.85)))).toFixed(1);

      const fmtSigned = (val, decimals = 0, suffix = '') => {
        const num = Number(val);
        if (isNaN(num)) return String(val);
        const sign = num > 0 ? '+' : '';
        const formatted = decimals > 0 ? num.toFixed(decimals) : num.toLocaleString();
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
          delta: fmtSigned(deltaUnits),
          unit: 'units',
          status: activeNetUnits >= 11135 ? 'Mandate Met' : (activeNetUnits > 0 ? 'On Track' : 'Baseline')
        },
        {
          key: 'rhna_progress_pct',
          label: 'RHNA % Progress',
          baseline: `${BASELINE.rhnaProgressPct.toFixed(1)}%`,
          active: `${activeRhnaPct}%`,
          delta: fmtSigned(deltaRhna, 1, '%'),
          unit: '%',
          status: activeRhnaPct >= 100.0 ? '100% Compliant' : `${activeRhnaPct}% of 11,135`
        },
        {
          key: 'commercial_jobs',
          label: 'Total Commercial Jobs',
          baseline: BASELINE.commercialJobs,
          active: activeJobs,
          delta: fmtSigned(deltaJobs),
          unit: 'jobs',
          status: deltaJobs > 0 ? 'Employment Growth' : 'Stable'
        },
        {
          key: 'jobs_housing_ratio',
          label: 'Jobs-to-Housing Balance Ratio',
          baseline: `${BASELINE.jobsHousingRatio.toFixed(2)}:1`,
          active: `${activeJhRatio}:1`,
          delta: `${fmtSigned(deltaJh, 2)}:1`,
          unit: 'ratio',
          status: activeJhRatio <= 1.5 ? 'Balanced Complete Community' : (activeJhRatio < 2.9 ? 'Improved Balance' : 'High In-Commuting')
        },
        {
          key: 'us101_vc_los',
          label: 'US-101 Corridor V/C & LOS',
          baseline: `${BASELINE.us101Vc.toFixed(2)} (LOS ${BASELINE.us101Los})`,
          active: `${active101Vc.toFixed(2)} (LOS ${active101Los})`,
          delta: `${fmtSigned(delta101Vc, 2)} (${active101Los} vs LOS ${BASELINE.us101Los})`,
          unit: 'V/C ratio',
          status: delta101Vc < 0 ? 'Congestion Mitigated' : (delta101Vc === 0 ? 'Baseline Congestion' : 'Severe Delay')
        },
        {
          key: 'ecr_vc_los',
          label: 'El Camino Real V/C & LOS',
          baseline: `${BASELINE.ecrVc.toFixed(2)} (LOS ${BASELINE.ecrLos})`,
          active: `${activeEcrVc.toFixed(2)} (LOS ${activeEcrLos})`,
          delta: `${fmtSigned(deltaEcrVc, 2)} (${activeEcrLos} vs LOS ${BASELINE.ecrLos})`,
          unit: 'V/C ratio',
          status: activeEcrLos === 'A' || activeEcrLos === 'B' ? 'Freeflow Arterial' : 'Moderate Flow'
        },
        {
          key: 'transit_mode_share',
          label: 'Transit / Sustainable Mode Share %',
          baseline: `${BASELINE.transitModeShare.toFixed(1)}%`,
          active: `${activeTransitShare}%`,
          delta: fmtSigned(deltaTransit, 1, '%'),
          unit: '%',
          status: activeTransitShare >= 45.0 ? 'Exceeds 2030 Climate Goal' : 'Progressing'
        },
        {
          key: 'clean_solar_mw',
          label: 'Clean Solar Energy Capacity (MW)',
          baseline: `${BASELINE.cleanSolarMw.toFixed(1)} MW`,
          active: `${activeSolarMw} MW`,
          delta: `${fmtSigned(deltaSolar, 1)} MW`,
          unit: 'MW',
          status: deltaSolar > 0 ? 'Expanded Rooftop Generation' : 'Baseline Grid'
        },
        {
          key: 'tree_canopy_pct',
          label: 'Urban Tree Canopy Coverage %',
          baseline: `${BASELINE.treeCanopyPct.toFixed(1)}%`,
          active: `${activeCanopyPct}%`,
          delta: fmtSigned(deltaCanopy, 1, '%'),
          unit: '%',
          status: activeCanopyPct >= 25.0 ? 'Meets Urban Forest Target' : 'Urban Canopy Deficit'
        },
        {
          key: 'flood_exposed_parcels',
          label: 'Sea Level Rise / Flood-Exposed Parcels',
          baseline: BASELINE.floodExposedParcels,
          active: activeFloodParcels,
          delta: fmtSigned(deltaFlood),
          unit: 'parcels',
          status: activeFloodParcels === 0 ? 'Zero Flood Vulnerability' : `${activeFloodParcels} Parcels at Inundation Risk`
        },
        {
          key: 'ite_net_daily_trips',
          label: 'ITE Net Daily Vehicle Trips',
          baseline: BASELINE.iteNetDailyTrips,
          active: activeNetTrips,
          delta: fmtSigned(deltaTrips),
          unit: 'trips/day',
          status: deltaTrips < 0 ? 'Net Trips Reduced' : 'Managed Trip Growth'
        },
        {
          key: 'transit_vmt_reduction_pct',
          label: 'Transit Proximity VMT Reduction %',
          baseline: `${BASELINE.transitVmtReductionPct.toFixed(1)}%`,
          active: `${activeVmtRedPct}%`,
          delta: fmtSigned(deltaVmtRed, 1, '%'),
          unit: '%',
          status: activeVmtRedPct >= 30.0 ? 'High-Efficiency Transit District' : 'Moderate Mitigation'
        }
      ];

      const indicatorMap = {};
      for (const ind of indicators) {
        indicatorMap[ind.key] = ind;
      }

      return {
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
     * R2.2: Export Structured Planning Report (JSON or Markdown)
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
        let md = `# CITY OF MOUNTAIN VIEW — URBAN PLANNING & DECISION SUPPORT REPORT\n`;
        md += `**California HCD 6th Cycle (2023–2031) Housing Element & Precise Plan Evaluation**\n\n`;
        md += `*Generated: ${timestamp} | Model: Mountain View 3D Digital Twin*\n`;
        md += `*Active Scenario: ${activeScenarioName} (${activeId})*\n`;
        md += `*Statutory Authority: California Gov. Code § 65580, § 65400 (HCD APR), and SB 743 (OPR CEQA VMT)*\n\n`;
        md += `---\n\n`;

        md += `## 1. Executive Summary & RHNA 6th Cycle Progress\n`;
        md += `- **Total Housing Units**: **${snap.housingUnits ? snap.housingUnits.toLocaleString() : '37,800'} units** (Net Added: **+${rhna.currentNetUnits.toLocaleString()} units**)\n`;
        md += `- **RHNA 6th Cycle Compliance**: **${rhna.percentComplete}%** of 11,135 Unit Mandate Met\n`;
        const lowerIncomeUnits = rhna.tiers.veryLow.units + rhna.tiers.low.units;
        const lowerIncomePct = +((lowerIncomeUnits / 4372) * 100).toFixed(1);
        md += `- **Lower-Income Housing Progress (<80% AMI)**: **+${lowerIncomeUnits.toLocaleString()} / 4,372 units (${lowerIncomePct}% Met)**\n`;
        md += `- **Effective Inclusionary Affordability Rate**: **${rhna.effectiveInclusionaryRate}%**\n`;
        md += `- **Jobs-to-Housing Balance**: **${snap.jobsHousingRatio !== undefined ? snap.jobsHousingRatio : 2.90}:1** (Baseline: 2.90:1)\n\n`;

        md += `### Statutory RHNA Affordability Tier Breakdown\n`;
        md += `| Income Tier | AMI Definition | Statutory Target | Units Generated | % Mandate Met | Compliance Status |\n`;
        md += `|---|---|---|---|---|---|\n`;
        md += `| **Very Low Income** | <50% AMI | 2,773 units | ${rhna.tiers.veryLow.units.toLocaleString()} units | ${rhna.tiers.veryLow.percent}% | ${rhna.tiers.veryLow.percent >= 100 ? '✅ COMPLIANT' : '⚠️ ALLOCATING'} |\n`;
        md += `| **Low Income** | 50–80% AMI | 1,599 units | ${rhna.tiers.low.units.toLocaleString()} units | ${rhna.tiers.low.percent}% | ${rhna.tiers.low.percent >= 100 ? '✅ COMPLIANT' : '⚠️ ALLOCATING'} |\n`;
        md += `| **Moderate Income** | 80–120% AMI | 1,885 units | ${rhna.tiers.moderate.units.toLocaleString()} units | ${rhna.tiers.moderate.percent}% | ${rhna.tiers.moderate.percent >= 100 ? '✅ COMPLIANT' : '⚠️ ALLOCATING'} |\n`;
        md += `| **Above Moderate Income** | >120% AMI (Market) | 4,878 units | ${rhna.tiers.aboveModerate.units.toLocaleString()} units | ${rhna.tiers.aboveModerate.percent}% | ${rhna.tiers.aboveModerate.percent >= 100 ? '✅ COMPLIANT' : '⚠️ ALLOCATING'} |\n`;
        md += `| **TOTAL MANDATE** | All Incomes | **11,135 units** | **${rhna.currentNetUnits.toLocaleString()} units** | **${rhna.percentComplete}%** | **${rhna.percentComplete >= 100 ? '✅ TARGET EXCEEDED' : '⚠️ IN PROGRESS'}** |\n\n`;

        md += `---\n\n`;
        md += `## 2. Precise Plan District Capacity Scorecards\n`;
        md += `| District Name | Parcels | Total Footprint Area | Target FAR | Net Added Units | Net Added Jobs | Jobs/Housing Ratio | RHNA Contrib % |\n`;
        md += `|---|---|---|---|---|---|---|---|\n`;
        for (const s of Object.values(scorecards)) {
          md += `| **${s.name}** | ${s.parcelCount.toLocaleString()} | ${s.totalFootprintSqm.toLocaleString()} m² (${s.totalFootprintAcres} ac) | ${s.targetFar} | +${s.netAddedUnits.toLocaleString()} | +${s.netAddedJobs.toLocaleString()} | ${s.jobsHousingRatio}:1 | ${s.rhnaContributionPercent}% |\n`;
        }

        md += `\n---\n\n`;
        md += `## 3. Baseline vs Active Scenario Delta Comparison\n`;
        md += `| Indicator | 2026 Baseline | Active Scenario | Delta Shift |\n`;
        md += `|---|---|---|---|\n`;
        for (const ind of comparison.indicators) {
          md += `| ${ind.label} | ${ind.baseline} | ${ind.active} | **${ind.delta}** |\n`;
        }

        return md;
      }

      // JSON format
      return {
        metadata: {
          jurisdiction: 'City of Mountain View',
          county: 'Santa Clara County',
          planningPeriod: '6th Cycle (2023–2031)',
          reportId: `MV-PLAN-${Date.now()}`,
          generatedAt: timestamp,
          modelEngine: 'Mountain View 3D Digital Twin City Planner Utility',
          legalAuthority: 'California Gov. Code § 65580, § 65400, SB 743'
        },
        activeScenario: {
          id: activeId,
          name: activeScenarioName,
          summary: `Zoning & Housing Element scenario evaluation against 2026 Baseline.`
        },
        rhnaCompliance: {
          totalMandate: RHNA_MANDATES.targetTotal,
          netUnitsAdded: rhna.currentNetUnits,
          totalProgressPct: rhna.percentComplete,
          lowerIncomeMandate: 4372,
          lowerIncomeUnits: rhna.tiers.veryLow.units + rhna.tiers.low.units,
          lowerIncomeProgressPct: +(((rhna.tiers.veryLow.units + rhna.tiers.low.units) / 4372) * 100).toFixed(1),
          effectiveInclusionaryRate: rhna.effectiveInclusionaryRate,
          tiers: {
            veryLow: {
              mandate: RHNA_MANDATES.veryLow,
              units: rhna.tiers.veryLow.units,
              progressPct: rhna.tiers.veryLow.percent,
              amiRange: '<50% AMI'
            },
            low: {
              mandate: RHNA_MANDATES.low,
              units: rhna.tiers.low.units,
              progressPct: rhna.tiers.low.percent,
              amiRange: '50-80% AMI'
            },
            moderate: {
              mandate: RHNA_MANDATES.moderate,
              units: rhna.tiers.moderate.units,
              progressPct: rhna.tiers.moderate.percent,
              amiRange: '80-120% AMI'
            },
            aboveModerate: {
              mandate: RHNA_MANDATES.aboveModerate,
              units: rhna.tiers.aboveModerate.units,
              progressPct: rhna.tiers.aboveModerate.percent,
              amiRange: '>120% AMI'
            }
          }
        },
        districtScorecards: Object.values(scorecards),
        baselineScenarioDelta: {
          activeScenario: activeId,
          baselineScenario: 'baseline',
          indicators: comparison.indicators
        },
        ceqaVmtTransportationImpact: {
          ceqaMetric: 'Vehicle Miles Traveled (VMT) per Capita',
          dailyUnmitigatedTrips: comparison.indicatorMap?.ite_net_daily_trips?.baseline || 371310,
          dailyNetTrips: comparison.indicatorMap?.ite_net_daily_trips?.active || 371310,
          transitProximityVmtReductionPct: comparison.indicatorMap?.transit_vmt_reduction_pct?.active || 22.4,
          corridors: {
            us101: snap.corridors?.us101 || { vc: 0.88, los: 'LOS D' },
            elCaminoReal: snap.corridors?.ecr || { vc: 0.64, los: 'LOS B' }
          }
        },
        environmentalSustainability: {
          cleanSolarPvCapacityMw: snap.solarMw || 154.0,
          estimatedAnnualCleanEnergyMwh: Math.round((snap.solarMw || 154.0) * 1650),
          urbanTreeCanopyPct: snap.greenspacePct || 16.4,
          urbanHeatIslandDeltaC: snap.uhiDelta || 0.0,
          stormwaterRunoffCapturePct: 30.0,
          scvurpppC3Compliant: true,
          seaLevelRiseSurgeM: (sim && sim.params && sim.params.baySurge) || 0.0,
          floodExposedParcelsCount: snap.flood?.inundatedBuildingCount || 0
        }
      };
    }

    return {
      getRhnaTierBreakdown,
      getDistrictScorecards,
      getParcelProForma,
      batchRezoneDistrict,
      applyZoneToDistrict: batchRezoneDistrict, // alias
      getScenarioComparison,
      exportPlanningReport
    };
  }

  return {
    createPlannerUtility
  };
});
