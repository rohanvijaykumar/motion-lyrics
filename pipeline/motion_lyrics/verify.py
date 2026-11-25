"""Second opinion and confidence: decide which lines a person should check.

Whisper listens to the vocal independently. Each aligned word is matched to
the word Whisper heard nearby (compared in romanized form, so any script
works). Lines where the two disagree, words placed in silence, and words the
aligner was unsure of are flagged. Flagged lines are listed in the review
report, drawn red in the timing overlay, and get a timing strip image.
"""

from __future__ import annotations

import difflib
import math

import numpy as np

from .romanize import to_tokens

LETTERS = set("abcdefghijklmnopqrstuvwxyz'")

# Thresholds (seconds / scores). Calibrated on JamendoLyrics; see bench.py.
DISAGREE_WORD = 0.6
DISAGREE_LINE = 0.45
LOW_SCORE = 0.02
LOW_VOICED = 0.3


def _rom(text: str, lang: str | None) -> str:
    return to_tokens(text, lang, LETTERS).replace("'", "")


def match_line(words: list[dict], lang: str | None, heard: list[dict]) -> list[tuple[int, dict, float]]:
    """Pairs (word index, heard word, similarity) in order, each heard word used once."""
    if not words or not heard:
        return []
    start, end = words[0]["start"] - 1.5, words[-1]["end"] + 1.5
    pool = [h for h in heard if start <= h["start"] <= end]
    pairs: list[tuple[int, dict, float]] = []
    j0 = 0
    for i, w in enumerate(words):
        a = _rom(w["text"], lang)
        if len(a) < 2:
            continue
        best, best_j, best_r = None, -1, 0.0
        for j in range(j0, len(pool)):
            h = pool[j]
            if abs(h["start"] - w["start"]) > 1.5:
                continue
            b = _rom(h["text"], lang)
            if not b:
                continue
            r = difflib.SequenceMatcher(None, a, b).ratio()
            if r > best_r:
                best, best_j, best_r = h, j, r
        if best is not None and best_r >= 0.6:
            pairs.append((i, best, best_r))
            j0 = best_j + 1
    return pairs


def score_term(score: float) -> float:
    lo, hi = math.log(0.003), math.log(0.4)
    return float(np.clip((math.log(max(score, 1e-6)) - lo) / (hi - lo), 0.0, 1.0))


def assess(lines: list[dict], heard_by_lang: dict[str, list[dict]] | None) -> None:
    """Add conf (0-1) and flags to every word and line, in place."""
    for line in lines:
        words = line["words"]
        heard = (heard_by_lang or {}).get(line.get("lang") or "", [])
        pairs = match_line(words, line.get("lang"), heard) if heard_by_lang is not None else []
        matched = {i: (h, r) for i, h, r in pairs}
        diffs = [words[i]["start"] - h["start"] for i, h, _ in pairs]
        line_flags: list[str] = []
        for i, w in enumerate(words):
            flags = list(w.get("flags", []))
            if w.get("score", 1.0) < LOW_SCORE:
                flags.append("aligner-unsure")
            if w.get("voiced", 1.0) < LOW_VOICED and len(_rom(w["text"], line.get("lang"))) > 1:
                flags.append("in-silence")
            if w["end"] - w["start"] > 6.0:
                flags.append("very-long")
            wt = 0.5
            if heard_by_lang is not None:
                if i in matched:
                    d = abs(w["start"] - matched[i][0]["start"])
                    wt = 1.0 if d <= 0.35 else 0.6 if d <= DISAGREE_WORD else 0.0
                    if d > DISAGREE_WORD:
                        flags.append("whisper-disagrees")
            conf = 0.5 * score_term(w.get("score", 0.0)) + 0.3 * float(w.get("voiced", 1.0)) + 0.2 * wt
            w["conf"] = round(conf, 3)
            w["flags"] = sorted(set(flags))
        if diffs and abs(float(np.median(diffs))) > DISAGREE_LINE:
            line_flags.append("whisper-disagrees")
        if heard_by_lang is not None and len(words) >= 3 and len(pairs) / len(words) < 0.25 and heard:
            line_flags.append("whisper-unheard")
        bad_words = sum(1 for w in words if w["flags"])
        if words and bad_words / len(words) >= 0.34:
            line_flags.append("many-flagged-words")
        line["conf"] = round(float(np.mean([w["conf"] for w in words])) if words else 0.0, 3)
        line["flags"] = sorted(set(line_flags))
        if line["conf"] < 0.35:
            line["flags"] = sorted(set(line["flags"] + ["low-confidence"]))
        line["review"] = review_level(line, heard_by_lang is not None)


def review_level(line: dict, listened: bool) -> str | None:
    """'check' = likely wrong, look at its timing strip; 'glance' = watch it in the draft.

    Calibrated on JamendoLyrics: lines with at least half their words anchored
    by Whisper were almost never wrong, so they are not flagged.
    """
    words = line["words"]
    if not words:
        return None
    flags = [f for w in words for f in w["flags"]]
    n = len(words)
    unsure = flags.count("aligner-unsure") / n
    anchored = sum(1 for w in words if w.get("anchored")) / n
    hard = "in-silence" in flags or "very-long" in flags
    if hard or "whisper-disagrees" in line["flags"] or "low-confidence" in line["flags"]:
        return "check"
    if listened:
        if anchored == 0 and unsure > 0.5:
            return "check"
        if anchored < 0.5 or "whisper-disagrees" in flags:
            return "glance"
        return None
    if unsure > 0.5:
        return "check"
    return "glance" if unsure > 0 else None
