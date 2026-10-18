// Caltrain live positions via the Worker proxy (caltrain.com's JSON mirror has no CORS).
// GET {proxy}/caltrain → { timestamp, trains:[{id, label, lat, lon, bearing, route, direction, tripId}] }
import { proxied, hasProxy } from '../proxy.js?v=1';

export const STATIONS = [
  { name: 'Mountain View', lat: 37.3944, lon: -122.0763 },
  { name: 'San Antonio', lat: 37.4072, lon: -122.1071 },
  { name: 'Sunnyvale', lat: 37.3784, lon: -122.0310 },
  { name: 'California Ave', lat: 37.4292, lon: -122.1420 }
];

export async function fetchTransit() {
  if (!hasProxy()) return { trains: null, stations: STATIONS };
  const r = await fetch(proxied('/caltrain'));
  if (!r.ok) throw new Error(`caltrain proxy ${r.status}`);
  const j = await r.json();
  return { trains: j.trains || [], timestamp: j.timestamp, stations: STATIONS };
}
