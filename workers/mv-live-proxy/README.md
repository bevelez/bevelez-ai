# Mountain View Live proxy (Cloudflare Worker)

Four public feeds used by `mountain-view.html` do not send CORS headers, so a browser on
bevelez.ai cannot read them directly: community ADS-B aircraft (adsb.fi / adsb.lol), CHP
incidents (`media.chp.ca.gov/sa_xml/sa.xml`), Caltrain live positions (`caltrain.com` JSON
mirror) and CAL FIRE incidents. This Worker fetches them server-side, filters to the Mountain
View area, and caches each response for a few seconds so every visitor shares one upstream poll.
No API keys are involved. The free Cloudflare plan is more than enough.

## Deploy (about five minutes)

```bash
cd workers/mv-live-proxy
npm i -g wrangler          # once
wrangler login             # opens the browser once
wrangler deploy            # prints https://mv-live-proxy.<your-subdomain>.workers.dev
```

Then open https://bevelez.ai/mountain-view.html → ⚙ Settings → paste the Worker URL into
"Proxy URL" → Save. Flights, CHP incidents and Caltrain turn on immediately. The URL is
stored in that browser's localStorage only; nothing is committed to the site.

To allow another origin (for local testing on a different port), edit `ALLOWED_ORIGINS` in
`worker.js`.

## Routes

| Route | Upstream | Edge cache |
|---|---|---|
| `/flights` | adsb.fi v3 (fallback adsb.lol v2), 22 nm around Mountain View | 5 s |
| `/chp` | CHP `sa.xml`, filtered to the bbox 37.25–37.52 N, 122.25–121.90 W | 60 s |
| `/caltrain` | `caltrain.com/files/rt/vehiclepositions/CT.json` | 30 s |
| `/calfire` | `incidents.fire.ca.gov` GeoJsonList | 5 min |
| `/` | health | none |

Attribution: adsb.fi and adsb.lol ask for a credit and a link (the site shows one);
CHP, Caltrain and CAL FIRE data are public.
