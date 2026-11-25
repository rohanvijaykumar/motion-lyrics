"""Alignment accuracy benchmark on JamendoLyrics.

JamendoLyrics (Durand, Stoller & Ewert, ICASSP 2023) is a public set of songs
whose every word was timed by hand. Running the aligner on it gives an honest,
repeatable accuracy number, so changes to the pipeline can be measured rather
than guessed. Audio is downloaded on demand into a cache folder and is never
committed (the songs carry their own Creative Commons licenses).

    uv run python -m motion_lyrics bench --songs 3

Metrics (word starts, in seconds): mean absolute error, median absolute
error, and the share of words within 0.3 s, the field's standard tolerance.
"""

from __future__ import annotations

import csv
import io
import json
import urllib.request
from pathlib import Path

import numpy as np

from . import log

BASE = "https://raw.githubusercontent.com/f90/jamendolyrics/master"
LANGS = {"English": "en", "French": "fr", "German": "de", "Spanish": "es"}


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "motion-lyrics-bench"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def pick_songs(per_lang: int) -> list[dict]:
    rows = list(csv.DictReader(io.StringIO(_get(f"{BASE}/JamendoLyrics.csv").decode("utf-8"))))
    chosen: list[dict] = []
    for lang in LANGS:
        clean = [r for r in rows if r["Language"] == lang
                 and r["LyricOverlap"] == "false" and r["Polyphonic"] == "false" and r["NonLexical"] == "false"]
        chosen += sorted(clean, key=lambda r: r["Filepath"])[:per_lang]
    return chosen


def fetch(song: dict, cache: Path) -> dict:
    stem = song["Filepath"].rsplit(".", 1)[0]
    d = cache / stem
    d.mkdir(parents=True, exist_ok=True)
    files = {
        "mp3": (f"{BASE}/mp3/{urllib.request.quote(song['Filepath'])}", d / "song.mp3"),
        "lyrics": (f"{BASE}/lyrics/{urllib.request.quote(stem)}.txt", d / "lyrics.txt"),
        "words": (f"{BASE}/annotations/words/{urllib.request.quote(stem)}.csv", d / "words.csv"),
    }
    for _, (url, path) in files.items():
        if not path.exists():
            path.write_bytes(_get(url))
    return {"dir": d, "lang": LANGS[song["Language"]], "name": stem}


def load_truth(d: Path) -> tuple[list[list[str]], np.ndarray]:
    lines = [l.split() for l in (d / "lyrics.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
    starts = []
    with open(d / "words.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            starts.append(float(row["word_start"]))
    return lines, np.asarray(starts)


def metrics(pred: np.ndarray, truth: np.ndarray) -> dict:
    err = np.abs(pred - truth)
    return {
        "words": int(len(err)),
        "mae": round(float(err.mean()), 3),
        "median": round(float(np.median(err)), 3),
        "within_0_3s": round(float(np.mean(err <= 0.3)), 3),
    }


def run(per_lang: int, cache: Path, out: Path, variants: list[str], whisper_model: str = "medium") -> dict:
    """Align each song with the production recipe and score it against the hand timings.

    Besides accuracy, it reports how well review flags catch mistakes: of the
    words more than 0.5 s off, the share that sit in a flagged line (recall),
    and the share of lines flagged (how much a person has to check).
    """
    from . import audio, refine, separate, stages
    from . import align as A
    from .transcribe import transcribe

    songs = [fetch(s, cache) for s in pick_songs(per_lang)]
    report: dict = {"songs": [], "overall": {}}
    pooled_pred, pooled_truth, pooled_flag = [], [], []
    for s in songs:
        d = s["dir"]
        log.info(f"Song {s['name']} ({s['lang']})")
        if not (d / "song.wav").exists():
            wav, sr = audio.load(d / "song.mp3", sr=44100)
            audio.save(d / "song.wav", wav, sr)
        if not (d / "vocals.wav").exists():
            separate.separate(d / "song.wav", d / "vocals.wav")
        if not (d / "emissions-v2.npy").exists():
            v, _ = audio.load(d / "vocals.wav", sr=16000, mono=True)
            np.save(d / "emissions-v2.npy", A.emissions(v[0]))
        em = np.load(d / "emissions-v2.npy")
        line_words, truth = load_truth(d)
        if sum(len(l) for l in line_words) != len(truth):
            log.warn(f"Skipping {s['name']}: lyric words and annotations differ in count")
            continue
        wcache = d / f"whisper-{whisper_model}.json"
        if not wcache.exists():
            wcache.write_text(json.dumps(transcribe(d / "vocals.wav", whisper_model, language=s["lang"])), encoding="utf-8")
        heard = {s["lang"]: [x for seg in json.loads(wcache.read_text(encoding="utf-8")) for x in seg["words"]]}
        env = refine.Envelope.from_file(d / "vocals.wav")
        lines_in = [
            {"id": f"l{i}", "lang": s["lang"], "words": [{"id": f"l{i}w{j}", "text": w} for j, w in enumerate(ws)]}
            for i, ws in enumerate(line_words)
        ]
        res = {"name": s["name"], "lang": s["lang"]}
        for variant in variants:
            use_heard = heard if variant in ("production", "anchored") else None
            al = stages.align_core(lines_in, em, env, use_heard)
            pred = np.asarray([w["start"] for l in al["lines"] for w in l["words"]])
            # A line counts as flagged when the review report lists it (check or glance).
            flagged = np.asarray([bool(l.get("review")) for l in al["lines"] for _ in l["words"]])
            checked = np.asarray([l.get("review") == "check" for l in al["lines"] for _ in l["words"]])
            m = metrics(pred, truth)
            bad = np.abs(pred - truth) > 0.5
            m["flag_recall"] = round(float(flagged[bad].mean()), 3) if bad.any() else 1.0
            m["check_recall"] = round(float(checked[bad].mean()), 3) if bad.any() else 1.0
            m["lines_check"] = round(float(np.mean([l.get("review") == "check" for l in al["lines"]])), 3)
            m["lines_flagged"] = round(float(np.mean([bool(l.get("review")) for l in al["lines"]])), 3)
            res[variant] = m
            if variant == variants[0]:
                pooled_pred.append(pred)
                pooled_truth.append(truth)
                pooled_flag.append(flagged)
            log.info(f"  {variant:>12}: MAE {m['mae']:.3f}s  median {m['median']:.3f}s  within 0.3s {m['within_0_3s']:.1%}  "
                     f"| bad words in flagged lines {m['flag_recall']:.0%} (in check lines {m['check_recall']:.0%}); lines check {m['lines_check']:.0%}, flagged {m['lines_flagged']:.0%}")
        report["songs"].append(res)

    if pooled_pred:
        pred, truth, flagged = np.concatenate(pooled_pred), np.concatenate(pooled_truth), np.concatenate(pooled_flag)
        m = metrics(pred, truth)
        bad = np.abs(pred - truth) > 0.5
        m["flag_recall"] = round(float(flagged[bad].mean()), 3) if bad.any() else 1.0
        m["unflagged_within_0_3s"] = round(float(np.mean(np.abs(pred - truth)[~flagged] <= 0.3)), 3) if (~flagged).any() else 1.0
        report["overall"][variants[0]] = m
        log.info(f"OVERALL {variants[0]}: MAE {m['mae']:.3f}s  median {m['median']:.3f}s  within 0.3s {m['within_0_3s']:.1%}  "
                 f"({m['words']} words); bad words caught by flags {m['flag_recall']:.0%}; "
                 f"unflagged words within 0.3s {m['unflagged_within_0_3s']:.1%}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
