# bevelez.ai — Interactive 3D Portfolio & Cassette Archive

Interactive **Three.js**, **Web Audio** and **Google Gemini / Lyria 3.5** works by **Brandon Edward Velez** ([bevelez.ai](https://bevelez.ai)), built with zero-bundler ES modules.

## The Cassette Archive (`vault.html`)

A 3D gallery (`vault.html`, `vault.js`) rendering six interactive works as floating, rotatable cassette tapes with procedural canvas cover art, 360° orbit/reel controls, and light/dark room modes:

1. **No. 01 — Clair de Lune (`clair-de-lune.html`, `clair-de-lune.js`)**
   - Intimate nocturnal study of Claude Debussy's *Clair de Lune* for dark-felt grand piano in D♭ major—listen as the piano performs automatically or play directly across the keys.
2. **No. 02 — Passacaglia in G Minor (`passacaglia.html`, `passacaglia.js`, `passacaglia-scenes.js`)**
   - A visual story of a life told through spatio-temporal 3D Fourier line sculptures flowing across eight movements of Handel's *Passacaglia* (HWV 432/6).
3. **No. 03 — Night Drive (`index.html`, `main.js`, `audio.js`, `radio.js`)**
   - Endless midnight highway cruiser serving as the site homepage, featuring **6 road worlds** (*Outrun Palms*, *FF7 Mako Reactor 01*, *Shinra HQ*, *The Drive*, *Windmill Sunset*, and *Ambient Tunnel*), a 1985 BTTF DeLorean, HDR `UnrealBloomPass` + film-grain post-processing, interactive steering/overdrive boost, and 4 camera modes.
   - **Outrun Radio & Lyria 3.5 Studio**: Road-synchronized procedural Web Audio synthwave and Lo-Fi FF7 MIDI radio stations (`radio.js`, `audio.js`), plus live 44.1 kHz stereo soundtrack generation via the Gemini Interactions API (`lyria-3.5` / `lyria-3-clip-preview`).
4. **No. 04 — Mountain View 3D (`mountain-view.html`, `mountain-view.js`, `mv-ride.js`)**
   - Day-and-night 3D digital twin of Mountain View, CA (~8,000 OpenStreetMap buildings, streets, parks, creeks, Moffett Field, the Googleplex, and Shoreline Amphitheatre) with lit windows after dark and a first-person bike commute mode up the Stevens Creek Trail.
5. **No. 05 — DJ Kronos (`kronos.html`, `kronos.js`)**
   - Cel-shaded 3D rhythm arena brawler scored at 92 BPM with Lyria 3.5 boss tracks, modular beat-locked combat (`combat/`), skeletal rigging & beat-warping (`anim/`), arena/character builders (`models/`), audio clocking (`audio/clock.js`), and custom `.glb` fighters.
6. **No. 06 — The Flying Dutchman (`flying-dutchman.html`)**
   - Interactive 2D isometric SVG & 3D CAD anatomy figure of an 1889 steampunk aether-galleon with clickable exploding assemblies, light/dark themes, and full 3D orbit, pan, and zoom.

## Offline Scripts & Asset Pipelines

- **`generate_lyria_track.py`** — CLI script to generate a custom 44.1 kHz stereo MP3 (`assets/lyria-cyberpunk.mp3`) using Google's `lyria-3.5` model via the Gemini Interactions API.
- **`scripts/build_mv_map.py` & `scripts/build_mv_ride.py`** — Offline builders that compile OpenStreetMap geometry and route data into `assets/mountain-view-map.json` and `assets/mountain-view-ride.json`.
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
