#!/usr/bin/env python3
"""Render the invented demo artists' cover art and avatars.

The homepage shows invented demo artists until real artists opt in to be
featured (Tim, 2026-11-08). Their imagery is drawn here, procedurally, so it
cannot resemble a real artist's artwork or a real person: no people, no
faces, no text, no music cliches (docs/marketing/IMAGERY.md section 4).

Deterministic: the same seed gives the same pixels, so re-running this script
is a no-op diff. Needs Python 3 with numpy and Pillow.

  python3 apps/web/scripts/demo-artists/render-demo-covers.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 640
OUT = Path(__file__).resolve().parents[2] / "public" / "img" / "demo-artists"


def grid(size: int = SIZE):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / (size - 1)
    return x, y


def smooth_noise(rng: np.random.Generator, cells: int, size: int = SIZE):
    """Value noise: a coarse random grid upsampled with bicubic filtering."""
    base = rng.random((cells, cells)).astype(np.float32)
    img = Image.fromarray((base * 255).astype(np.uint8), "L")
    img = img.resize((size, size), Image.Resampling.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def streak_noise(rng: np.random.Generator, cols: int, rows: int, size: int = SIZE):
    """Noise stretched sideways: water ripples and rain streaks."""
    base = rng.random((rows, cols)).astype(np.float32)
    img = Image.fromarray((base * 255).astype(np.uint8), "L")
    img = img.resize((size, size), Image.Resampling.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def smoothstep(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def water_glints(rng, x, y, cx, horizon, width, depth):
    """A broken column of light on water: thin horizontal glints."""
    below = np.clip((y - horizon) / (1 - horizon), 0, 1)
    wobble = (streak_noise(rng, 5, 70) - 0.5) * 0.05 * (0.2 + below)
    column = np.exp(-((x - cx + wobble) / (width * (0.35 + 1.6 * below))) ** 2)
    glint = smoothstep(0.45, 0.75, streak_noise(rng, 18, 150) * 0.7 + streak_noise(rng, 40, 260) * 0.3)
    fade = np.exp(-below / depth)
    return column * (0.25 + 0.75 * glint) * fade * (y > horizon)


def fbm(rng: np.random.Generator, octaves=(3, 6, 12, 24), size: int = SIZE):
    total = np.zeros((size, size), np.float32)
    amp, norm = 1.0, 0.0
    for cells in octaves:
        total += amp * smooth_noise(rng, cells, size)
        norm += amp
        amp *= 0.5
    return total / norm


def blur(arr: np.ndarray, radius: float) -> np.ndarray:
    """Gaussian blur in the frequency domain (wraps at the edges)."""
    squeeze = arr.ndim == 2
    if squeeze:
        arr = arr[..., None]
    h, w = arr.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * (math.pi**2) * (radius**2) * (fx**2 + fy**2))
    out = np.empty_like(arr)
    for c in range(arr.shape[2]):
        out[..., c] = np.real(np.fft.ifft2(np.fft.fft2(arr[..., c]) * kernel))
    return out[..., 0] if squeeze else out


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def rgb(hex_: str) -> np.ndarray:
    hex_ = hex_.lstrip("#")
    return np.array([int(hex_[i : i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def ramp(t: np.ndarray, stops: list[tuple[float, str]]) -> np.ndarray:
    """Multi-stop colour ramp."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        local = (t[m] - p0) / max(p1 - p0, 1e-6)
        local = local * local * (3 - 2 * local)
        out[m] = rgb(c0) * (1 - local[:, None]) + rgb(c1) * local[:, None]
    return out


def finish(img: np.ndarray, rng: np.random.Generator, grain=0.035, vignette=0.35):
    x, y = grid(img.shape[0])
    d = np.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2) / math.sqrt(0.5)
    img = img * (1 - vignette * d[..., None] ** 2)
    # Film grain: luminance-weighted so shadows stay clean.
    lum = img.mean(axis=2, keepdims=True)
    noise = rng.normal(0, 1, img.shape[:2]).astype(np.float32)[..., None]
    img = img + grain * noise * (0.35 + 0.65 * np.sqrt(np.clip(lum, 0, 1)))
    # Gentle filmic shoulder.
    img = 1 - np.exp(-img * 1.35)
    img = img / (1 - math.exp(-1.35))
    return np.clip(img, 0, 1)


# ---------------------------------------------------------------- covers


def low_sun(rng):
    """A low sun half under a still horizon: the lead single's cover."""
    x, y = grid()
    horizon = 0.64
    sky = ramp(y / horizon, [(0, "#05070f"), (0.55, "#141a3a"), (0.85, "#3a2f6b"), (1, "#8a6fc4")])
    sun_c = (0.5, horizon)
    r = np.sqrt(((x - sun_c[0]) * 1.0) ** 2 + ((y - sun_c[1]) * 1.0) ** 2)
    disc = np.clip((0.19 - r) / 0.004, 0, 1) * (y < horizon)
    glow = np.exp(-(r / 0.22) ** 2) * 0.9 + np.exp(-(r / 0.5) ** 2) * 0.35
    sky = sky + glow[..., None] * rgb("#b9a6ff") * (y < horizon)[..., None] * 0.55
    sky = mix(sky, rgb("#f4efff"), disc * 0.92)
    # Water: darker than the sky, the sun broken into glints.
    water = ramp(np.clip((y - horizon) / (1 - horizon), 0, 1), [(0, "#2a2350"), (0.5, "#0d0b22"), (1, "#03040a")])
    glints = water_glints(rng, x, y, 0.5, horizon, 0.11, 0.45)
    halo = np.exp(-(((x - 0.5) / 0.35) ** 2) - ((y - horizon) / 0.12) ** 2)
    water = water + glints[..., None] * rgb("#e4dcff") * 0.95 + halo[..., None] * rgb("#6b58b8") * 0.18
    img = np.where((y < horizon)[..., None], sky, water)
    line = np.exp(-((y - horizon) / 0.002) ** 2)
    img = img + line[..., None] * rgb("#c9bcff") * 0.35
    return finish(img, rng, grain=0.04)


def slow_weather(rng):
    """City lights out of focus through a wet window, cool cyan."""
    x, y = grid()
    base = ramp(y, [(0, "#030b10"), (0.55, "#082230"), (1, "#020507")])
    bokeh = np.zeros((SIZE, SIZE), np.float32)
    for _ in range(26):
        cx, cy = rng.random() * 1.1 - 0.05, 0.25 + rng.random() * 0.55
        rad = 0.025 + rng.random() ** 2 * 0.08
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        disc = smoothstep(rad, rad * 0.86, d)
        rim = np.exp(-((d - rad * 0.9) / (rad * 0.08)) ** 2) * 0.35
        bokeh += (disc * 0.55 + rim) * (0.25 + rng.random() * 0.75)
    bokeh = blur(bokeh, 1.2)
    warmth = smooth_noise(rng, 3)
    tint = mix(rgb("#4fd2e6")[None, None, :], rgb("#9fe9f2")[None, None, :], warmth)
    img = base + bokeh[..., None] * tint * 0.8
    rain = smoothstep(0.62, 0.9, streak_noise(rng, 220, 6))
    img = img * (0.9 + 0.12 * rain[..., None])
    return finish(img, rng, grain=0.035, vignette=0.45)

def glass_coast(rng):
    """A dusk gradient refracted through vertical fluted glass."""
    x, y = grid()
    bands = 22
    phase = (x * bands) % 1.0
    offset = (phase - 0.5) * 0.09
    t = np.clip(y + offset * (1 - y), 0, 1)
    img = ramp(t, [(0, "#0a0c1c"), (0.45, "#23306b"), (0.7, "#3d7fb8"), (0.82, "#9fd2e6"), (1, "#0b1424")])
    edge = np.exp(-((phase - 0.02) / 0.02) ** 2) + np.exp(-((phase - 0.98) / 0.02) ** 2)
    img = img + edge[..., None] * 0.06
    img = img * (0.92 + 0.08 * np.cos(phase * math.pi * 2)[..., None])
    return finish(img, rng, grain=0.03)


def night_ferry(rng):
    """One light on black water, a long broken reflection."""
    x, y = grid()
    horizon = 0.42
    img = ramp(y, [(0, "#020308"), (0.42, "#081030"), (0.43, "#03050f"), (1, "#010205")])
    src = (0.62, horizon - 0.012)
    r = np.sqrt((x - src[0]) ** 2 + (y - src[1]) ** 2)
    img = img + np.exp(-(r / 0.006) ** 2)[..., None] * rgb("#ffffff") * 1.4
    img = img + np.exp(-(r / 0.06) ** 2)[..., None] * rgb("#4a7dff") * 0.3
    shore = np.exp(-((y - horizon) / 0.004) ** 2) * (0.4 + 0.6 * smooth_noise(rng, 30))
    img = img + shore[..., None] * rgb("#2b3f7a") * 0.25
    glints = water_glints(rng, x, y, src[0], horizon, 0.018, 0.6)
    img = img + glints[..., None] * rgb("#a9c4ff") * 0.85
    return finish(img, rng, grain=0.045, vignette=0.5)

def paper_satellites(rng):
    """Thin orbits on warm paper-grey, one small lit body."""
    x, y = grid()
    paper = fbm(rng, (8, 64, 256))
    img = ramp(paper * 0.4 + y * 0.6, [(0, "#d9d6cf"), (1, "#b5b1a8")])
    cx, cy = 0.46, 0.54
    r = np.sqrt((x - cx) ** 2 + ((y - cy) * 1.0) ** 2)
    for rad in (0.12, 0.2, 0.29, 0.39):
        img = img - np.exp(-((r - rad) / 0.0016) ** 2)[..., None] * 0.55
    body = np.sqrt((x - (cx + 0.29 * math.cos(-0.6))) ** 2 + (y - (cy + 0.29 * math.sin(-0.6))) ** 2)
    img = mix(img, rgb("#1d2a8f"), np.clip((0.022 - body) / 0.002, 0, 1))
    img = mix(img, rgb("#121212"), np.clip((0.045 - r) / 0.002, 0, 1))
    return finish(img, rng, grain=0.025, vignette=0.12)


def first_frost(rng):
    """Ridges fading into morning fog, silver-blue."""
    x, y = grid()
    img = ramp(y, [(0, "#c8d6e2"), (0.5, "#90a6b9"), (1, "#5d7387")])
    layers = 6
    for i in range(layers):
        k = i / (layers - 1)
        line = smooth_noise(rng, 4 + i * 2)[SIZE // 2]
        line2 = smooth_noise(rng, 24 + i * 6)[SIZE // 3]
        ridge = 0.38 + k * 0.42 + (line - 0.5) * (0.18 - k * 0.06) + (line2 - 0.5) * 0.02
        mask = smoothstep(ridge[None, :] - 0.002, ridge[None, :] + 0.002, y)
        tone = rgb("#9fb3c4") * (1 - k) + rgb("#0e1720") * k
        fog = np.clip((y - ridge[None, :]) * 2.5, 0, 1)
        layer = mix(tone[None, None, :] * np.ones_like(img), rgb("#d7e3ec"), (1 - fog) * 0.35 * (1 - k))
        img = mix(img, layer, mask)
    return finish(img, rng, grain=0.03, vignette=0.25)

def avatar(rng):
    """The artist's avatar: a crop of the lead single's light, no person."""
    img = low_sun(np.random.default_rng(11))
    h = SIZE
    crop = img[int(h * 0.3) : int(h * 0.3) + int(h * 0.5), int(h * 0.25) : int(h * 0.25) + int(h * 0.5)]
    pil = Image.fromarray((crop * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    return np.asarray(pil, np.float32) / 255


ARTIST = "ivo-lindqvist"
COVERS = {
    "slow-weather": (slow_weather, 21),
    "glass-coast": (glass_coast, 34),
    "night-ferry": (night_ferry, 55),
    "paper-satellites": (paper_satellites, 89),
    "low-sun": (low_sun, 11),
    "first-frost": (first_frost, 144),
    "avatar": (avatar, 3),
}

SIDECAR = {
    "schema": "jovie.marketing-image/v1",
    "kind": "demo-artist-art",
    "subject": "abstract",
    "demo": True,
    "source": "procedural",
    "generator": "apps/web/scripts/demo-artists/render-demo-covers.py",
    "note": "Invented demo artist imagery. No person, no text, resembles no real release.",
}


def main() -> None:
    out_dir = OUT / ARTIST
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, (fn, seed) in COVERS.items():
        arr = fn(np.random.default_rng(seed))
        img = Image.fromarray((np.clip(arr, 0, 1) * 255).round().astype(np.uint8), "RGB")
        path = out_dir / f"{name}.jpg"
        img.save(path, "JPEG", quality=86, optimize=True, progressive=True)
        (out_dir / f"{name}.jpg.meta.json").write_text(json.dumps(SIDECAR, indent=2) + "\n")
        print(f"wrote {path.relative_to(OUT.parents[2])} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
