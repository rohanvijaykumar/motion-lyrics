"""Speech recognition with word timestamps (faster-whisper).

Used for two jobs:
  * **transcribe** - when no lyrics are supplied, produce a first draft of them.
  * **verify** - an independent second opinion on timing; words where Whisper
    and the forced aligner disagree are flagged for review.
"""

from __future__ import annotations

from pathlib import Path

from . import log


def transcribe(
    wav_path: Path,
    model_size: str = "medium",
    language: str | None = None,
    clip: tuple[float, float] | None = None,
    device: str | None = None,
) -> list[dict]:
    """Return segments: [{start, end, text, words: [{text, start, end, prob}]}]."""
    import numpy as np
    from faster_whisper import WhisperModel

    from . import audio

    try:
        import torch

        cuda = torch.cuda.is_available()
    except Exception:
        cuda = False
    device = device or ("cuda" if cuda else "cpu")
    compute = "float16" if device == "cuda" else "int8"
    log.info(f"Loading Whisper '{model_size}' on {device} ({compute})")
    model = WhisperModel(model_size, device=device, compute_type=compute)

    wav, sr = audio.load(wav_path, sr=16000, mono=True)
    x = wav[0]
    offset = 0.0
    if clip:
        a, b = int(clip[0] * sr), int(clip[1] * sr)
        x, offset = x[a:b], clip[0]

    # Fixed 20 s windows with 2 s overlap: on music, Whisper's own long-form
    # mode tends to skip whole passages; short windows keep it listening.
    win, hop = int(20 * sr), int(18 * sr)
    out: list[dict] = []
    detected = language
    for k, a in enumerate(range(0, max(1, len(x) - int(2 * sr)), hop)):
        piece = x[a : a + win]
        if len(piece) < sr // 2:
            break
        segments, info = model.transcribe(
            np.ascontiguousarray(piece, dtype=np.float32),
            language=language,
            word_timestamps=True,
            vad_filter=False,
            condition_on_previous_text=False,
            beam_size=5,
        )
        detected = detected or info.language
        base = offset + a / sr
        keep_from = base + (1.0 if k > 0 else 0.0)
        keep_to = base + 19.0 if a + win < len(x) else float("inf")
        for seg in segments:
            words = [
                {"text": w.word.strip(), "start": round(w.start + base, 3), "end": round(w.end + base, 3),
                 "prob": round(float(w.probability), 3)}
                for w in (seg.words or [])
                if keep_from <= w.start + base < keep_to
            ]
            if words:
                out.append({"start": words[0]["start"], "end": words[-1]["end"],
                            "text": " ".join(w["text"] for w in words), "words": words})
    log.info(f"Whisper heard {sum(len(s['words']) for s in out)} words (language: {detected})")
    return out
