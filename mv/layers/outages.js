// PG&E power outages from PG&E's own public ArcGIS view (CORS *). Points within 20 km.
import { MV } from '../map.js?v=1';

const BASE = 'https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/Power_Outages_(View)/FeatureServer/0/query';

export async function fetchOutages() {
  const q = new URLSearchParams({
    f: 'geojson', where: '1=1', outFields: '*',
    geometry: `${MV.lon},${MV.lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
    distance: '20000', units: 'esriSRUnit_Meter', resultRecordCount: '200'
  });
  const r = await fetch(`${BASE}?${q}`);
  if (!r.ok) throw new Error(`pge ${r.status}`);
  const j = await r.json();
  return (j.features || []).map((f) => {
    const p = f.properties || {};
    return {
      id: p.IncidentId || p.OBJECTID,
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
      customers: p.ImpactedCustomers || 0,
      cause: p.Cause || 'Unknown',
      status: p.OutageStatus || '',
      type: p.OutageType || '',
      start: p.StartDate, etr: p.EstimatedRestoreDate,
      county: p.County || ''
    };
  }).sort((a, b) => b.customers - a.customers);
}
