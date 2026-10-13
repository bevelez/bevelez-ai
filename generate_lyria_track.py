#!/usr/bin/env python3
"""
Generate a Cyberpunk Chill Synthwave soundtrack using Google's Lyria 3.5 model
via the Gemini Interactions API and save it to ./assets/lyria-cyberpunk.mp3.

Usage:
  GEMINI_API_KEY="your_api_key" python3 generate_lyria_track.py
"""

import base64
import json
import os
import sys
import urllib.request
import urllib.error

DEFAULT_PROMPT = (
    "Instrumental chill cyberpunk synthwave soundtrack for driving down a neon "
    "highway toward a futuristic megacity at midnight. Warm analog Juno pads, "
    "deep rolling sub-bass arpeggio, dreamy atmospheric synth lead, nostalgic "
    "and cinematic, 92 BPM."
)

def generate_track(api_key: str, model: str = "lyria-3.5", prompt: str = DEFAULT_PROMPT):
    url = "https://generativelanguage.googleapis.com/v1beta/interactions"
    payload = {
        "model": model,
        "input": prompt,
        "response_format": {"type": "audio"}
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    print(f"[Lyria 3.5] Requesting music generation from {model}...")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"Error calling Gemini API ({e.code}): {err_body}", file=sys.stderr)
        sys.exit(1)

    audio_b64 = None
    if isinstance(data.get("output_audio"), dict):
        audio_b64 = data["output_audio"].get("data")

    if not audio_b64 and isinstance(data.get("steps"), list):
        for step in data["steps"]:
            if step.get("type") == "model_output":
                for block in step.get("content", []):
                    if block.get("type") == "audio" and block.get("data"):
                        audio_b64 = block["data"]
                        break

    if not audio_b64:
        print("Error: No audio block found in API response.", file=sys.stderr)
        sys.exit(1)

    os.makedirs("assets", exist_ok=True)
    out_path = os.path.join("assets", "lyria-cyberpunk.mp3")
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(audio_b64))

    print(f"Success! Saved 44.1 kHz Lyria 3.5 track to {out_path}")

if __name__ == "__main__":
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        print("Please set GEMINI_API_KEY environment variable first:")
        print('  GEMINI_API_KEY="AIza..." python3 generate_lyria_track.py')
        sys.exit(1)
    generate_track(key)
