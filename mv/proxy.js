// Optional Cloudflare Worker proxy for feeds that do not send CORS headers
// (aircraft, CHP incidents, Caltrain). See workers/mv-live-proxy/README.md.
// The base URL is stored in this browser only.

export const PROXY_KEY = 'mv_live_proxy_url';
export const DEFAULT_PROXY = '';

export function proxyBase() {
  const v = (localStorage.getItem(PROXY_KEY) || DEFAULT_PROXY).trim().replace(/\/+$/, '');
  return v;
}
export function hasProxy() { return proxyBase().length > 0; }
export function proxied(path) {
  const base = proxyBase();
  if (!base) throw new ProxyMissing();
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
export class ProxyMissing extends Error {
  constructor() { super('needs the proxy (⚙ Settings → Proxy URL)'); this.name = 'ProxyMissing'; }
}
