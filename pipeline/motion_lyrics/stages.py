"""Pipeline stages, each reading and writing files inside a project folder.

    work/audio.wav        song audio (written by the Node CLI)
    work/lyrics.json      words to align (written by the Node CLI)
    work/vocals.wav       isolated lead vocal            <- separate
    analysis.json         loudness, beats, faces         <- analyze (read by the renderer)
    work/whisper-<lang>.json  what Whisper heard         <- listen
    work/alignment.json   word timings, scores, flags    <- align (uses Whisper as anchors)
    review/strips/*.png   timing pictures for checking   <- strips
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from . import align as A
from . import audio, log, refine, verify
from .log import read_json, write_json

CACHE = Path(__file__).resolve().parents[2] / ".cache"


def _work(project: Path) -> Path:
    w = project / "work"
    w.mkdir(parents=True, exist_ok=True)
    return w


def separate(project: Path, force: bool = False, enabled: bool = True) -> None:
    from .separate import separate as run

    w = _work(project)
    src, dst = w / "audio.wav", w / "vocals.wav"
    if not src.exists():
        log.fail(f"{src} is missing; run the Node CLI (npm run make) which extracts it")
    if not enabled:
        log.info("Vocal separation is off; aligning against the full mix")
        audio.save(dst, *audio.load(src, sr=44100))
        return
    if dst.exists() and not force and dst.stat().st_mtime >= src.stat().st_mtime:
        log.info("Vocals already separated (use --force to redo)")
        return
    run(src, dst)


def analyze(project: Path, video: Path | None, faces: bool, duration: float) -> None:
    from .analyze import run

    w = _work(project)
    result = run(w, video, faces, CACHE / "models", duration)
    write_json(project / "analysis.json", result)
    log.info(f"Wrote {project / 'analysis.json'}")


def _heard(w: Path) -> dict[str, list[dict]] | None:
    files = sorted(w.glob("whisper-*.json"))
    vocals = w / "vocals.wav"
    fresh = [f for f in files if not vocals.exists() or f.stat().st_mtime >= vocals.stat().st_mtime]
    if not fresh:
        return None
    heard: dict[str, list[dict]] = {}
    for f in fresh:
        lang = f.stem[len("whisper-"):]
        heard["" if lang == "auto" else lang] = [x for seg in read_json(f) for x in seg["words"]]
    return heard


def align_core(lines_in: list[dict], em: np.ndarray, env: refine.Envelope, heard: dict[str, list[dict]] | None) -> dict:
    """The production alignment recipe (also measured by the benchmark)."""
    from .anchors import find_anchors

    em = A.voicing_prior(em, env.db, refine.HOP_S)
    _, labels = A._load_model("cpu")
    lines = [
        A.Line(id=l["id"], lang=l.get("lang"), words=[A.Word(id=x["id"], text=x["text"], tokens="") for x in l["words"]])
        for l in lines_in
    ]
    anchors = find_anchors(lines, heard) if heard else None
    if anchors is not None:
        log.info(f"{len(anchors)} of {sum(len(l.words) for l in lines)} words anchored by Whisper")
    A.align_lines(lines, em, labels, **A.PRODUCTION, anchors=anchors)
    refine.refine(lines, env)
    out = {
        "version": 1,
        "model": "mms_fa",
        "anchors": len(anchors or {}),
        "lines": [
            {
                "id": l.id,
                "lang": l.lang,
                "words": [
                    {
                        "id": x.id,
                        "text": x.text,
                        "start": round(x.start, 3),
                        "end": round(x.end, 3),
                        "score": round(x.score, 4),
                        "voiced": round(x.voiced, 3),
                        "anchored": bool(anchors and (li, wi) in anchors),
                        "flags": x.flags,
                    }
                    for wi, x in enumerate(l.words)
                ],
            }
            for li, l in enumerate(lines)
        ],
    }
    verify.assess(out["lines"], heard)
    return out


def listen(project: Path, model: str) -> None:
    """Whisper transcribes the vocal once per language: anchors and a second opinion."""
    from .transcribe import transcribe

    w = _work(project)
    lyr = read_json(w / "lyrics.json")
    langs = sorted({l.get("lang") or "" for l in lyr["lines"] if l.get("sung", True)})
    for lang in langs:
        cache = w / f"whisper-{lang or 'auto'}.json"
        if cache.exists() and cache.stat().st_mtime >= (w / "vocals.wav").stat().st_mtime:
            log.info(f"Already listened for '{lang or 'auto'}' (cached)")
            continue
        log.info(f"Whisper listening for language '{lang or 'auto'}'")
        write_json(cache, transcribe(w / "vocals.wav", model, language=_whisper_lang(lang)))


def align(project: Path, use_anchors: bool = True) -> None:
    """lyrics.json + vocals.wav (+ Whisper) -> alignment.json (timings, confidence, flags)."""
    w = _work(project)
    lyr = read_json(w / "lyrics.json")
    lines_in = [l for l in lyr["lines"] if l.get("sung", True)]
    if not lines_in:
        log.fail("lyrics.json has no sung lines to align")
    wav, _ = audio.load(w / "vocals.wav", sr=16000, mono=True)
    log.info("Listening to the vocal (computing letter probabilities)")
    em = A.emissions(wav[0])
    env = refine.Envelope.from_file(w / "vocals.wav")
    heard = _heard(w) if use_anchors else None
    out = align_core(lines_in, em, env, heard)
    write_json(w / "alignment.json", out)
    flagged = sum(1 for l in out["lines"] if l["flags"] or any(x["flags"] for x in l["words"]))
    log.info(f"Aligned {len(out['lines'])} lines; {flagged} flagged for review")


def _whisper_lang(lang: str | None) -> str | None:
    if not lang:
        return None
    base = lang.split("-")[0].lower()
    return {"zh": "zh", "yue": "yue"}.get(base, base)


def transcribe_draft(project: Path, model: str, language: str | None) -> None:
    """No lyrics supplied: write a first draft of lyrics.txt from Whisper."""
    from .transcribe import transcribe

    w = _work(project)
    segs = transcribe(w / "vocals.wav", model, language=language)
    write_json(w / "transcript.json", segs)
    lines = []
    for s in segs:
        text = s["text"].strip()
        if text:
            lines.append(text)
    header = "# Draft lyrics made by speech recognition. CHECK EVERY LINE against the song,\n" \
             "# fix mistakes, then run `npm run make -- <project>` again.\n"
    if language:
        header += f"@lang: {language}\n"
    (project / "lyrics.txt").write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    log.info(f"Wrote draft {project / 'lyrics.txt'} ({len(lines)} lines)")


def strips(project: Path, line_ids: list[str]) -> None:
    """Draw a timing strip (vocal spectrogram + word boxes) for each listed line."""
    from .romanize import romanize
    from .strips import render_strip

    w = _work(project)
    song = read_json(project / "song.json")
    tracks = {t["id"]: t for t in song["tracks"]}
    out = project / "review" / "strips"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    heard: list[tuple[str, float, float]] = []
    for f in w.glob("whisper-*.json"):
        for s in read_json(f):
            heard += [(x["text"], x["start"], x["end"]) for x in s["words"]]
    lines = {l["id"]: l for g in song["groups"] for l in g["lines"]}
    for lid in line_ids:
        line = lines.get(lid)
        if not line or not line["words"]:
            continue
        lang = tracks.get(line["track"], {}).get("lang")
        t0 = max(0.0, line["words"][0]["start"] - 1.0)
        t1 = line["words"][-1]["end"] + 1.0
        words = [(romanize(x["text"], lang), x["start"], x["end"]) for x in line["words"]]
        layers = [("lyrics", words)]
        if heard:
            layers.append(("whisper", [(romanize(t, lang), a, b) for t, a, b in heard if b >= t0 and a <= t1]))
        render_strip(w / "vocals.wav", out / f"{lid}.png", t0, t1, layers, f"{lid}  {t0:.2f}-{t1:.2f}s  flags: {', '.join(line.get('flags') or []) or 'none'}")
    log.info(f"Wrote {len(line_ids)} timing strips to {out}")


def sheet(images: list[Path], out: Path, cols: int = 4, width: int = 480) -> None:
    """Tile still frames into one contact sheet with timestamps."""
    from PIL import Image, ImageDraw

    from .strips import _font

    if not images:
        return
    th = int(width * 9 / 16)  # every cell is 16:9; taller frames are letterboxed, not cropped
    thumbs = []
    for p in images:
        im = Image.open(p).convert("RGB")
        scale = min(width / im.width, th / im.height)
        thumbs.append((p.stem, im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))))
    rows = (len(thumbs) + cols - 1) // cols
    label = 26
    canvas = Image.new("RGB", (cols * width, rows * (th + label)), (12, 12, 14))
    d = ImageDraw.Draw(canvas)
    f = _font(16)
    for i, (name, im) in enumerate(thumbs):
        x, y = (i % cols) * width, (i // cols) * (th + label)
        canvas.paste(im, (x + (width - im.width) // 2, y + label + (th - im.height) // 2))
        d.text((x + 6, y + 4), name, fill=(235, 235, 235), font=f)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=88)
    log.info(f"Wrote contact sheet {out}")


def prefetch(whisper_model: str) -> None:
    """Download every model up front so the first real run is not interrupted."""
    import torch  # noqa: F401
    from demucs.pretrained import get_model

    log.info("Fetching Demucs vocal separation model")
    get_model("htdemucs")
    log.info("Fetching MMS alignment model")
    A._load_model("cpu")
    log.info(f"Fetching Whisper '{whisper_model}' model")
    from faster_whisper import WhisperModel

    WhisperModel(whisper_model, device="cpu", compute_type="int8")
    from .analyze import _yunet

    _yunet(CACHE / "models")
    log.info("All models ready")


def doctor(whisper_model: str = "medium") -> dict:
    """Environment and model check used by `npm run doctor`."""
    import platform

    import torch

    hub = Path(torch.hub.get_dir()) / "checkpoints"
    models = {
        "Demucs (singer separation)": any(hub.glob("955717e8-*.th")),
        "MMS (word timing)": any(hub.glob("*mms*")) or any(hub.glob("model.pt")),
        "Face detector": (CACHE / "models" / "face_detection_yunet_2023mar.onnx").exists(),
    }
    try:
        from huggingface_hub import try_to_load_from_cache

        hit = try_to_load_from_cache(f"Systran/faster-whisper-{whisper_model}", "model.bin")
        models[f"Whisper {whisper_model} (cross-check)"] = isinstance(hit, str)
    except Exception:
        models[f"Whisper {whisper_model} (cross-check)"] = False
    return {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cuda": bool(torch.cuda.is_available()),
        "models": models,
    }
