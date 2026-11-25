"""Timing strips: a picture of the vocal track with the word boxes drawn on it.

A strip lets a person or an AI agent *see* whether a word box sits on the
sung syllable: each word should start where a bright band begins in the vocal
spectrogram. Strips are written for every flagged line during review.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import audio

PX_PER_S = 160
HEIGHT = 220
_PALETTE = [(255, 196, 64), (90, 200, 255), (255, 110, 160), (140, 255, 140)]


def _font(size: int):
    for name in ("arial.ttf", "DejaVuSans.ttf", "Helvetica.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _melspec(x: np.ndarray, sr: int) -> np.ndarray:
    import librosa

    m = librosa.feature.melspectrogram(y=x, sr=sr, n_fft=1024, hop_length=sr // 100, n_mels=96, fmax=8000)
    db = librosa.power_to_db(m, ref=np.max)
    return np.clip((db + 70) / 70, 0, 1)  # 0..1, low frequencies first


def render_strip(
    vocals: Path,
    out: Path,
    t0: float,
    t1: float,
    layers: list[tuple[str, list[tuple[str, float, float]]]],
    title: str = "",
) -> None:
    """Draw ``layers`` (name, [(label, start, end)]) over the spectrogram of [t0, t1]."""
    wav, sr = audio.load(vocals, sr=16000, mono=True)
    a, b = max(0, int(t0 * sr)), min(wav.shape[1], int(t1 * sr))
    spec = _melspec(wav[0, a:b], sr)
    width = max(200, int((t1 - t0) * PX_PER_S))
    img_spec = Image.fromarray((spec[::-1] * 255).astype(np.uint8)).resize((width, HEIGHT))
    lane_h = 26
    H = HEIGHT + 30 + lane_h * len(layers)
    img = Image.new("RGB", (width, H), (16, 16, 20))
    colored = Image.merge("RGB", (img_spec, img_spec.point(lambda v: int(v * 0.8)), img_spec.point(lambda v: int(v * 0.5))))
    img.paste(colored, (0, 30))
    d = ImageDraw.Draw(img)
    f, fs = _font(14), _font(12)
    d.text((6, 6), title, fill=(230, 230, 230), font=f)
    # Second ticks.
    s = int(np.ceil(t0 * 4)) / 4
    while s <= t1:
        x = int((s - t0) * PX_PER_S)
        major = abs(s - round(s)) < 1e-6
        d.line([(x, 30), (x, 30 + (12 if major else 5))], fill=(200, 200, 200))
        if major:
            d.text((x + 2, 31), f"{s:.0f}s", fill=(200, 200, 200), font=fs)
        s += 0.25
    for li, (name, words) in enumerate(layers):
        col = _PALETTE[li % len(_PALETTE)]
        y = HEIGHT + 30 + li * lane_h
        d.text((4, y + 6), name, fill=col, font=fs)
        for label, ws, we in words:
            if we < t0 or ws > t1:
                continue
            x0, x1 = int((ws - t0) * PX_PER_S), int((we - t0) * PX_PER_S)
            d.rectangle([x0, y + 3, max(x0 + 2, x1), y + lane_h - 3], outline=col, width=2)
            d.line([(x0, 30), (x0, HEIGHT + 30)], fill=col, width=1)
            d.text((x0 + 3, y + 6), label, fill=(255, 255, 255), font=fs)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
