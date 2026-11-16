# bevelez.ai — Interactive 3D Portfolio & Cassette Archive

Interactive **Three.js**, **Web Audio** and **Google Gemini / Lyria 3.5** works by **Brandon Edward Velez** ([bevelez.ai](https://bevelez.ai)), built with zero-bundler ES modules.

## The Cassette Archive (`vault.html`)

A 3D gallery (`vault.html`, `vault.js`) rendering **nine interactive works** as floating, rotatable cassette tapes with bespoke procedural `1024×480` canvas cover art, 360° orbit/reel controls, light/dark room modes, and a single shared offscreen `WebGLRenderer` + PMREM environment pipeline:

1. **No. 01 — Clair de Lune (`clair-de-lune.html`, `clair-de-lune.js`)**
   - Intimate nocturnal study of Claude Debussy's *Clair de Lune* for dark-felt grand piano in D♭ major—listen as the piano performs automatically or play directly across the keys.
2. **No. 02 — Passacaglia in G Minor (`passacaglia.html`, `passacaglia.js`, `passacaglia-scenes.js`)**
   - A visual story of a life told through spatio-temporal 3D Fourier line sculptures flowing across eight movements of Handel's *Passacaglia* (HWV 432/6).
3. **No. 03 — Night Drive (`index.html`, `main.js`, `audio.js`, `radio.js`, `roads/`)**
   - Endless midnight highway cruiser serving as the site homepage across **6 bespoke road worlds**:
     1. *Outrun Palms* — Synthwave neon grid, palm boulevards, and retro horizon sun.
     2. *FF7 Mako Reactor 01* — Sector 1 causeway and towering Mako reactor complex.
     3. *Shinra HQ / Midgar Expressway* — Upper-plate steel megastructure and Shinra headquarters spire.
     4. *The Drive — LA Dusk Sixth Street Viaduct* (`roads/the-drive.js`) — Synth-noir Los Angeles River viaduct arches, DTLA dusk skyline, and palm-lined expressway.
     5. *Windmill Sunset — Mojave Pass & Ivanpah Solar* (`roads/windmill.js`) — Golden-hour desert mountain pass with spinning wind-farm turbines and heliostat solar tower arrays.
     6. *Ambient Tunnel — Subsea Megatunnel* (`roads/tunnel.js`) — High-speed glass-and-concrete subsea tube with sweeping sodium/cyan light ribs and oceanic caustics.
   - **32-Bar Outrun Radio & Lyria 3.5 Studio**: Road-synchronized procedural Web Audio synthwave, chillwave, progressive techno, and Lo-Fi FF7 MIDI radio stations (`MIDNIGHT CRUISE`, `BOMBING MISSION`, `SHINRA INC.`, `NEON COAST`, `SUNSET INTERSTATE`, and `CHROME HORIZON` in `radio.js` & `audio.js`), plus live 44.1 kHz stereo soundtrack generation via the Gemini Interactions API (`lyria-3.5` / `lyria-3-clip-preview`).
4. **No. 04 — Mountain View 3D (`mountain-view.html`, `mountain-view.js`, `mv-ride.js`)**
   - Day-and-night 3D digital twin of Mountain View, CA (~8,000 OpenStreetMap buildings, streets, parks, creeks, Moffett Field, the Googleplex, and Shoreline Amphitheatre) with lit windows after dark and a first-person bike commute mode up the Stevens Creek Trail.
5. **No. 05 — DJ Kronos (`kronos.html`, `kronos.js`)**
   - Cel-shaded 3D rhythm arena brawler scored at 92 BPM with Lyria 3.5 boss tracks, modular beat-locked combat (`combat/`), skeletal rigging & beat-warping (`anim/`), arena/character builders (`models/`), audio clocking (`audio/clock.js`), and custom `.glb` fighters.
6. **No. 06 — The Flying Dutchman (`flying-dutchman.html`)**
   - Interactive 2D isometric SVG & 3D CAD anatomy figure of an 1889 steampunk aether-galleon with clickable exploding assemblies, light/dark themes, and full 3D orbit, pan, and zoom.
7. **No. 07 — Pirate Frequency (`pirate-frequency.html`, `pirate-frequency.js`, `pirate-frequency/`)**
   - Cel-shaded 3D hoverboard courier score-attack across nocturnal Mountain View (`107.7 FM`), carving streets and grinding neon overpass & Castro Street rails to race bootleg cassette drops before sign-off while tricks on the `118 BPM` beat dynamically un-mute all 4 funk/breakbeat Pirate Radio stems (`DRUMS`, `BASS`, `RHODES`, `LEAD`).
8. **No. 08 — Aether Broadside (`aether-broadside.html`, `aether-broadside.js`, `aether-broadside/`)**
   - 1889 steampunk cloud-sea airship naval duel aboard *H.M.A.S. Flying Dutchman* across four squadron waves (culminating in *HMS Leviathan*): tack storm winds, balance the 15.5-bar Scotch marine aether-boiler, unleash 6-gun port & starboard broadsides, and toggle live between 3D Gunnery Helm and Isometric X-Ray CAD Damage Control (with `0.5x` tactical time dilation and filtered `6/8` orchestral-clockwork audio) to dispatch repair crews and vent steam.
9. **No. 09 — Harmonic Lock (`harmonic-lock.html`, `harmonic-lock.js`, `harmonic-lock/`)**
   - `124 BPM` synesthetic 3D spline rail-shooter (*Rez* × *Star Fox 64*) flying a 3-stage evolving vector craft (*Vector Dart* → *Valkyrie* → *Seraph*) through four morphing architectural & 3D Fourier megastructures (*Phosphor Lattice*, *Fourier Cathedral*, *Subspace Conduit*, *Singularity Core*), featuring an 8-slot quantized musical paint-lock reticle (`4.0x` Full Harmonic Octet), barrel-roll bolt deflection, Overdrive resonance waves, and the 3-phase *SERAPH-IX* boss.

## Offline Scripts & Asset Pipelines

- **`generate_lyria_track.py`** — CLI script to generate a custom 44.1 kHz stereo MP3 (`assets/lyria-cyberpunk.mp3`) using Google's `lyria-3.5` model via the Gemini Interactions API.
- **`scripts/build_road_drive.py`, `scripts/build_road_windmill.py` & `scripts/build_road_tunnel.py`** — Offline procedural glTF 2.0 `.glb` builders compiling road segment and landmark geometry (`assets/models/night-drive-city.glb`, `assets/models/night-drive-windmill.glb`, and `assets/models/night-drive-tunnel.glb`) for *Night Drive* Roads 4–6.
- **`scripts/build_mv_map.py` & `scripts/build_mv_ride.py`** — Offline builders that compile OpenStreetMap geometry and route data into `assets/mountain-view-map.json` and `assets/mountain-view-ride.json` (powering both *Mountain View 3D* and *Pirate Frequency*).
- **`tools/character-pipeline/`** — Python 3D character pipeline for *DJ Kronos* (background cleanup, 3D mesh generation, texture projection, skeletal rig fitting, and locomotion clip authoring).

## Local Preview

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open **http://127.0.0.1:8765** in your browser.

## Baking a Lyria 3.5 Soundtrack to Disk

You can generate and save `assets/lyria-cyberpunk.mp3` either from the **✦ LYRIA 3.5** button in the top bar of Night Drive, or via terminal:

```bash
GEMINI_API_KEY="your_gemini_api_key" python3 generate_lyria_track.py
```
