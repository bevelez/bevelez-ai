// USGS earthquakes, past 7 days, within ~200 km of Mountain View. No key, CORS enabled.
import { MV } from '../map.js?v=1';

const URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';
const RADIUS_KM = 200;

function kmBetween(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function fetchQuakes() {
  const r = await fetch(URL);
  if (!r.ok) throw new Error(`usgs ${r.status}`);
  const j = await r.json();
  return (j.features || [])
    .map((f) => ({
      id: f.id,
      mag: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      url: f.properties.url,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depth: f.geometry.coordinates[2]
    }))
    .map((q) => ({ ...q, km: kmBetween(MV.lat, MV.lon, q.lat, q.lon) }))
    .filter((q) => q.km <= RADIUS_KM)
    .sort((a, b) => b.time - a.time);
}
