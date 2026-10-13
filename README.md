# BEVELEZ.AI — Cyberpunk Synthwave Coming Soon Landing Page

Interactive **Three.js** + **Lyria 3.5 / Web Audio** landing page for **Brandon Edward Velez** (`bevelez.ai`).

## Features
- **Three.js Cyberpunk Endless Highway (`main.js`)**:
  - Custom wedge cyberpunk supercar with glowing LED tail light bar, plasma afterburner exhausts, neon cyan underglow, rear louvers, and spinning neon-rimmed wheels.
  - Endless scrolling multi-lane highway with neon shoulder rails, passing cyber streetlamp pylons & overhead arches, and procedural outrun wireframe mountains on both sides.
  - Procedural 74-tower cyberpunk megacity skyline at the horizon with lit window grids, audio-reactive neon crowns, and a segmented synthwave sun.
  - Post-processing `UnrealBloomPass` for authentic neon glow.
  - Interactive steering (`Mouse`, `Touch`, or `A`/`D` / `←`/`→`), `Shift` or `⚡ OVERDRIVE` turbo boost (warps FOV & stretches plasma flames to 248 MPH), and 4 camera angles (`CHASE`, `LOW RETRO`, `COCKPIT HOOD`, `HELI WIDE`).
- **Dual-Engine Cyberpunk Chill Audio (`audio.js`)**:
  - **Built-in Web Audio Synthwave Engine**: Instant 92 BPM chill cyberpunk soundtrack (warm detuned Juno pads, rolling sub-bass arpeggio, stereo-delay pluck lead, and 80s gated-reverb drums) with zero external dependencies.
  - **Google Gemini API Lyria 3.5 Integration (`lyria-3.5` / `lyria-3-clip-preview`)**: Generate a custom 44.1 kHz stereo MP3 directly from the in-app **✦ LYRIA 3.5** modal or via the CLI script `generate_lyria_track.py`. If `assets/lyria-cyberpunk.mp3` is present, the site plays it automatically.

## Local Preview
```bash
python3 -m http.server 8765 --bind 127.0.0.1
```
Then open **http://127.0.0.1:8765** in your browser.

## Baking a Lyria 3.5 Soundtrack to Disk
You can generate and save `assets/lyria-cyberpunk.mp3` either from the **✦ LYRIA 3.5** button in the top bar of the page, or via terminal:
```bash
GEMINI_API_KEY="your_gemini_api_key" python3 generate_lyria_track.py
```
