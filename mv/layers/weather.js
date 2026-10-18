// Weather + air quality (Open-Meteo, no key, CORS) and NWS active alerts (api.weather.gov, no key, CORS).
import { MV } from '../map.js?v=1';

const WX_URL = `https://api.open-meteo.com/v1/forecast?latitude=${MV.lat}&longitude=${MV.lon}` +
  '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,precipitation,is_day' +
  '&hourly=temperature_2m,precipitation_probability,weather_code&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min' +
  '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FLos_Angeles&forecast_days=2';
const AQ_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${MV.lat}&longitude=${MV.lon}` +
  '&current=us_aqi,pm2_5,pm10,ozone,us_aqi_pm2_5&timezone=America%2FLos_Angeles';
const ALERTS_URL = `https://api.weather.gov/alerts/active?point=${MV.lat},${MV.lon}`;

export const WMO = {
  0: ['Clear', '☀'], 1: ['Mostly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁'],
  45: ['Fog', '🌫'], 48: ['Rime fog', '🌫'], 51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Heavy drizzle', '🌧'],
  61: ['Light rain', '🌧'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'], 71: ['Snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '🌨'],
  80: ['Showers', '🌦'], 81: ['Showers', '🌧'], 82: ['Violent showers', '⛈'], 95: ['Thunderstorm', '⛈'], 96: ['Thunderstorm, hail', '⛈'], 99: ['Thunderstorm, hail', '⛈']
};

export function aqiBand(aqi) {
  if (aqi == null) return ['—', '#8a93a6'];
  if (aqi <= 50) return ['Good', '#46e094'];
  if (aqi <= 100) return ['Moderate', '#f2d049'];
  if (aqi <= 150) return ['Unhealthy (sensitive)', '#f2ae49'];
  if (aqi <= 200) return ['Unhealthy', '#f25c54'];
  if (aqi <= 300) return ['Very unhealthy', '#b06cf2'];
  return ['Hazardous', '#7a2a2a'];
}

export async function fetchWeather() {
  const r = await fetch(WX_URL);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  return r.json();
}
export async function fetchAirQuality() {
  const r = await fetch(AQ_URL);
  if (!r.ok) throw new Error(`open-meteo aq ${r.status}`);
  return r.json();
}
export async function fetchAlerts() {
  const r = await fetch(ALERTS_URL, { headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error(`nws ${r.status}`);
  const j = await r.json();
  return (j.features || []).map((f) => ({
    id: f.id,
    event: f.properties.event,
    severity: f.properties.severity,
    headline: f.properties.headline,
    ends: f.properties.ends || f.properties.expires,
    description: f.properties.description
  }));
}

export function windDir(deg) {
  const d = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return d[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}
