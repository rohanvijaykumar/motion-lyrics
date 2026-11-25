"""Isolate the lead vocal with Demucs so alignment hears the singer, not the band."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from . import audio, log


def separate(src: Path, vocals_out: Path, model_name: str = "htdemucs", device: str | None = None) -> None:
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    log.info(f"Loading Demucs model '{model_name}' on {device}")
    model = get_model(model_name)
    model.eval()

    wav, sr = audio.load(src, sr=model.samplerate)
    if wav.shape[0] == 1:
        wav = np.repeat(wav, 2, axis=0)
    elif wav.shape[0] > 2:
        wav = wav[:2]

    t = torch.from_numpy(wav)
    ref = t.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    t = (t - mean) / std

    log.info(f"Separating vocals from {wav.shape[1] / sr:.1f}s of audio (this is the slowest step on CPU)")
    with torch.no_grad():
        sources = apply_model(
            model, t[None], device=device, shifts=1, split=True, overlap=0.25, progress=False
        )[0]
    sources = sources * std + mean

    names = list(model.sources)
    if "vocals" not in names:
        log.fail(f"Model '{model_name}' has no vocals stem (stems: {names})")
    vocals = sources[names.index("vocals")].cpu().numpy()
    audio.save(vocals_out, vocals, sr)
    log.info(f"Wrote {vocals_out}")
