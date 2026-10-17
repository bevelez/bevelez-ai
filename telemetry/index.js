/**
 * telemetry/index.js — Live Environmental Telemetry Pipeline (Open-Meteo & NOAA CO-OPS 9414523)
 * with Honest Provenance Tracking (LIVE | CACHED | FALLBACK CONSTANT).
 *
 * Fixes from Remediation Brief Sections 1, 2 & 5:
 * - Requests `shortwave_radiation` (true Global Horizontal Irradiance, GHI) and
 *   `direct_normal_irradiance` (DNI) from Open-Meteo instead of mislabeling `global_tilted_irradiance`.
 * - Preserves `0.0 W/m²` at night via explicit finite/null checks instead of `|| 780`.
 * - Replaces `"PUBLISHED BASELINE"` fallback label with `"FALLBACK CONSTANT"`.
 * - Deletes dead `getRhnaBaseline` and `getCaltrainSchedule` methods (Section 5).
 */

import { PROVENANCE, SOLAR_MODEL, HYDRO_MODEL } from '../sim/constants.js';

const CACHE_KEY_WEATHER = 'bevelez_mv_weather_cache';
const CACHE_KEY_TIDE = 'bevelez_mv_tide_cache';

export class TelemetryPipeline {
  constructor() {
    this.subscribers = [];
    this.history = [];
    this.latestSnapshot = null;
    this.tickCount = 0;

    this.weatherData = {
      tempC: SOLAR_MODEL.fallbackTempC,
      tempF: +(SOLAR_MODEL.fallbackTempC * 9 / 5 + 32).toFixed(1),
      humidity: 45,
      solarDni: SOLAR_MODEL.fallbackDniWm2,
      solarGhi: SOLAR_MODEL.fallbackGhiWm2,
      windKph: SOLAR_MODEL.fallbackWindKmh,
      windDir: 310,
      timestamp: Date.now(),
      source: 'Fallback Constant (Midday Clear-Sky Reference)',
      isLive: false,
      provenance: PROVENANCE.FALLBACK_CONSTANT
    };

    this.tideData = {
      waterLevelM: HYDRO_MODEL.fallbackTideMetersNavd88,
      stationId: HYDRO_MODEL.noaaStationId,
      stationName: HYDRO_MODEL.noaaStationName,
      datum: 'NAVD88',
      timestamp: Date.now(),
      source: 'Fallback Constant (NOAA 9414523 MHHW 1.72m NAVD88)',
      isLive: false,
      provenance: PROVENANCE.FALLBACK_CONSTANT
    };

    this._loadCachedTelemetry();
    this._updateProvenanceUI();
  }

  _loadCachedTelemetry() {
    try {
      if (typeof localStorage === 'undefined') return;
      const weatherCached = localStorage.getItem(CACHE_KEY_WEATHER);
      if (weatherCached) {
        const parsed = JSON.parse(weatherCached);
        if (parsed && typeof parsed.tempC === 'number') {
          this.weatherData = {
            ...parsed,
            isLive: false,
            provenance: PROVENANCE.CACHED
          };
        }
      }
      const tideCached = localStorage.getItem(CACHE_KEY_TIDE);
      if (tideCached) {
        const parsed = JSON.parse(tideCached);
        if (parsed && typeof parsed.waterLevelM === 'number') {
          this.tideData = {
            ...parsed,
            isLive: false,
            provenance: PROVENANCE.CACHED
          };
        }
      }
    } catch (_) {
      // Ignore storage read errors
    }
    this._updateProvenanceUI();
  }

  async fetchWeather() {
    // Request shortwave_radiation (true Global Horizontal Irradiance, GHI) and direct_normal_irradiance (DNI)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${SOLAR_MODEL.latitudeDeg}&longitude=${SOLAR_MODEL.longitudeDeg}&current=temperature_2m,relative_humidity_2m,direct_normal_irradiance,shortwave_radiation,wind_speed_10m,wind_direction_10m&timezone=America%2FLos_Angeles`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const curr = data.current || {};
        const tempC = typeof curr.temperature_2m === 'number' ? curr.temperature_2m : SOLAR_MODEL.fallbackTempC;
        const tempF = +(tempC * 9 / 5 + 32).toFixed(1);
        const humidity = typeof curr.relative_humidity_2m === 'number' ? curr.relative_humidity_2m : 45;
        // Preserve 0.0 W/m² at night! Never use `|| 780`.
        const solarDni = (curr.direct_normal_irradiance !== undefined && curr.direct_normal_irradiance !== null && Number.isFinite(Number(curr.direct_normal_irradiance)))
          ? Math.max(0, Number(curr.direct_normal_irradiance))
          : SOLAR_MODEL.fallbackDniWm2;
        const solarGhi = (curr.shortwave_radiation !== undefined && curr.shortwave_radiation !== null && Number.isFinite(Number(curr.shortwave_radiation)))
          ? Math.max(0, Number(curr.shortwave_radiation))
          : SOLAR_MODEL.fallbackGhiWm2;
        const windKph = typeof curr.wind_speed_10m === 'number' ? curr.wind_speed_10m : SOLAR_MODEL.fallbackWindKmh;
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
          source: 'Open-Meteo (37.3861°N, 122.0839°W — shortwave_radiation GHI + DNI)',
          isLive: true,
          provenance: PROVENANCE.LIVE
        };
        this.weatherData = record;
        try {
          localStorage.setItem(CACHE_KEY_WEATHER, JSON.stringify(record));
        } catch (_) {}
        this._updateProvenanceUI();
        return record;
      }
    } catch (_) {
      // Fall back to cached or fallback constant without noisy console warnings
    }
    this._updateProvenanceUI();
    return this.weatherData;
  }

  async fetchTides() {
    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?date=latest&station=${HYDRO_MODEL.noaaStationId}&product=water_level&datum=NAVD&time_zone=lst_ldt&units=metric&application=bevelez_twin&format=json`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 0 && data.data[0].v !== undefined && data.data[0].v !== '') {
          const v = parseFloat(data.data[0].v);
          const record = {
            waterLevelM: Number.isFinite(v) ? v : HYDRO_MODEL.fallbackTideMetersNavd88,
            stationId: HYDRO_MODEL.noaaStationId,
            stationName: HYDRO_MODEL.noaaStationName,
            datum: 'NAVD88',
            timestamp: Date.now(),
            source: `NOAA CO-OPS Station ${HYDRO_MODEL.noaaStationId}`,
            isLive: true,
            provenance: PROVENANCE.LIVE
          };
          this.tideData = record;
          try {
            localStorage.setItem(CACHE_KEY_TIDE, JSON.stringify(record));
          } catch (_) {}
          this._updateProvenanceUI();
          return record;
        }
      }
    } catch (_) {
      // Fall back to cached or fallback constant without noisy console warnings
    }
    this._updateProvenanceUI();
    return this.tideData;
  }

  _updateProvenanceUI() {
    if (typeof document === 'undefined') return;
    if (typeof window !== 'undefined' && window.TelemetryPipeline && window.TelemetryPipeline !== this) return;
    const weatherBadge = document.getElementById('prov-weather');
    if (weatherBadge) {
      const isLive = Boolean(this.weatherData && this.weatherData.isLive);
      const prov = this.weatherData ? this.weatherData.provenance : PROVENANCE.FALLBACK_CONSTANT;
      if (isLive) {
        weatherBadge.innerHTML = '<span class="prov-dot live">●</span> LIVE OPEN-METEO';
      } else if (prov === PROVENANCE.CACHED) {
        weatherBadge.innerHTML = '<span class="prov-dot cached">●</span> CACHED';
      } else {
        weatherBadge.innerHTML = '<span class="prov-dot baseline">●</span> FALLBACK CONSTANT';
      }
      if (this.weatherData) {
        const w = this.weatherData;
        weatherBadge.title = `Weather: ${w.tempC}°C / ${w.tempF}°F | DNI: ${w.solarDni} W/m² | GHI (shortwave_radiation): ${w.solarGhi} W/m² | Wind: ${w.windKph} km/h (${w.provenance})`;
      }
    }
    const tideBadge = document.getElementById('prov-tide');
    if (tideBadge) {
      const isLive = Boolean(this.tideData && this.tideData.isLive);
      const prov = this.tideData ? this.tideData.provenance : PROVENANCE.FALLBACK_CONSTANT;
      if (isLive) {
        tideBadge.innerHTML = '<span class="prov-dot live">●</span> LIVE NOAA 9414523';
      } else if (prov === PROVENANCE.CACHED) {
        tideBadge.innerHTML = '<span class="prov-dot cached">●</span> CACHED';
      } else {
        tideBadge.innerHTML = '<span class="prov-dot baseline">●</span> FALLBACK CONSTANT';
      }
      if (this.tideData) {
        const t = this.tideData;
        tideBadge.title = `Tide Water Level: ${t.waterLevelM} m NAVD88 | Station: ${t.stationId} (${t.stationName || 'Redwood City SF Bay'}) (${t.provenance})`;
      }
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
      weatherProvenance: this.weatherData ? this.weatherData.provenance : PROVENANCE.FALLBACK_CONSTANT,
      tideProvenance: this.tideData ? this.tideData.provenance : PROVENANCE.FALLBACK_CONSTANT,
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
