"""Audio loading, resampling and loudness envelopes."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
import soxr


def load(path: Path, sr: int | None = None, mono: bool = False) -> tuple[np.ndarray, int]:
    """Load audio as float32 shaped (channels, samples)."""
    data, file_sr = sf.read(str(path), dtype="float32", always_2d=True)
    audio = data.T  # (channels, samples)
    if sr is not None and sr != file_sr:
        audio = soxr.resample(audio.T, file_sr, sr, quality="HQ").T.astype(np.float32)
        file_sr = sr
    if mono:
        audio = audio.mean(axis=0, keepdims=True)
    return np.ascontiguousarray(audio), file_sr


def save(path: Path, audio: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio.T, sr, subtype="PCM_16")


def rms_envelope(mono: np.ndarray, sr: int, hop_s: float = 0.01, win_s: float = 0.04) -> np.ndarray:
    """RMS loudness in dB at a fixed hop. ``mono`` is 1-D."""
    hop = max(1, int(round(sr * hop_s)))
    win = max(hop, int(round(sr * win_s)))
    pad = win // 2
    x = np.pad(mono.astype(np.float64), (pad, pad))
    n = 1 + max(0, (len(x) - win) // hop)
    # Cumulative sum of squares gives a fast moving window.
    c = np.concatenate([[0.0], np.cumsum(x * x)])
    starts = np.arange(n) * hop
    energy = (c[starts + win] - c[starts]) / win
    return (10.0 * np.log10(energy + 1e-10)).astype(np.float32)
