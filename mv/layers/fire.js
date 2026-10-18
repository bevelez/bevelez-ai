// Wildfire incidents from NIFC WFIGS (interagency, public domain, CORS *). Within 120 km.
import { MV } from '../map.js?v=1';

const BASE = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query';

export async function fetchFires() {
  const q = new URLSearchParams({
    f: 'geojson', where: '1=1',
    outFields: 'IncidentName,FireDiscoveryDateTime,IncidentSize,PercentContained,POOState,POOCounty,FireCause,IncidentTypeCategory,ModifiedOnDateTime_dt,UniqueFireIdentifier',
    geometry: `${MV.lon},${MV.lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    distance: '120000', units: 'esriSRUnit_Meter', resultRecordCount: '100'
  });
  const r = await fetch(`${BASE}?${q}`);
  if (!r.ok) throw new Error(`nifc ${r.status}`);
  const j = await r.json();
  return (j.features || []).map((f) => {
    const p = f.properties || {};
    const lon = f.geometry.coordinates[0], lat = f.geometry.coordinates[1];
    const dx = (lon - MV.lon) * 111.32 * Math.cos(MV.lat * Math.PI / 180), dy = (lat - MV.lat) * 110.57;
    return {
      id: p.UniqueFireIdentifier || p.IncidentName,
      name: p.IncidentName, lat, lon,
      acres: p.IncidentSize || 0, contained: p.PercentContained,
      county: p.POOCounty || '', cause: p.FireCause || '', category: p.IncidentTypeCategory || '',
      discovered: p.FireDiscoveryDateTime, updated: p.ModifiedOnDateTime_dt,
      km: Math.round(Math.sqrt(dx * dx + dy * dy))
    };
  }).sort((a, b) => a.km - b.km);
}
