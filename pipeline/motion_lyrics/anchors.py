"""Anchors: words Whisper heard clearly, used to keep the aligner on track.

On long or densely produced songs a forced aligner can drift, placing a
passage seconds away from where it is sung. Whisper transcribes the vocal
independently; we line its words up with the lyrics (sequence alignment on
romanized letters, so any script works) and keep only confident, distinctive
matches. Each anchor tells the aligner "this word starts near here", as a soft
preference that strong acoustic evidence can still override.
"""

from __future__ import annotations

import difflib

from .romanize import to_tokens

LETTERS = set("abcdefghijklmnopqrstuvwxyz'")


def _rom(text: str, lang: str | None) -> str:
    return to_tokens(text, lang, LETTERS).replace("'", "")


def _sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def sequence_match(lyric: list[str], heard: list[str], gap: float = -0.4) -> list[tuple[int, int, float]]:
    """Needleman-Wunsch alignment of two word lists; returns matched (i, j, similarity)."""
    n, m = len(lyric), len(heard)
    if not n or not m:
        return []
    sims = [[_sim(a, b) for b in heard] for a in lyric]
    NEG = -1e9
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    back = [[0] * (m + 1) for _ in range(n + 1)]  # 0 diag, 1 up (skip lyric), 2 left (skip heard)
    for i in range(1, n + 1):
        score[i][0] = score[i - 1][0] + gap
        back[i][0] = 1
    for j in range(1, m + 1):
        score[0][j] = score[0][j - 1] + gap
        back[0][j] = 2
    for i in range(1, n + 1):
        si = sims[i - 1]
        row, prev = score[i], score[i - 1]
        for j in range(1, m + 1):
            s = si[j - 1]
            d = prev[j - 1] + (2.0 * (s - 0.5) if s >= 0.5 else -1.0)
            u = prev[j] + gap
            l = row[j - 1] + gap
            if d >= u and d >= l:
                row[j], back[i][j] = d, 0
            elif u >= l:
                row[j], back[i][j] = u, 1
            else:
                row[j], back[i][j] = l, 2
    _ = NEG
    pairs: list[tuple[int, int, float]] = []
    i, j = n, m
    while i > 0 and j > 0:
        b = back[i][j]
        if b == 0:
            if sims[i - 1][j - 1] >= 0.5:
                pairs.append((i - 1, j - 1, sims[i - 1][j - 1]))
            i, j = i - 1, j - 1
        elif b == 1:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs


def find_anchors(
    lines,
    heard_by_lang: dict[str, list[dict]],
    min_sim: float = 0.8,
    min_prob: float = 0.45,
    min_letters: int = 3,
) -> dict[tuple[int, int], float]:
    """Map (line index, word index) -> start time Whisper heard for that word."""
    anchors: dict[tuple[int, int], float] = {}
    langs = {l.lang or "" for l in lines}
    for lang in langs:
        heard = sorted(heard_by_lang.get(lang, []), key=lambda h: h["start"])
        if not heard:
            continue
        keys: list[tuple[int, int]] = []
        lyric: list[str] = []
        for li, line in enumerate(lines):
            if (line.lang or "") != lang:
                continue
            for wi, w in enumerate(line.words):
                keys.append((li, wi))
                lyric.append(_rom(w.text, line.lang))
        hrom = [_rom(h["text"], lang) for h in heard]
        for i, j, s in sequence_match(lyric, hrom):
            h = heard[j]
            if s >= min_sim and len(lyric[i]) >= min_letters and h.get("prob", 1.0) >= min_prob:
                anchors[keys[i]] = float(h["start"])
    # Keep anchors in time order across the whole song (drop any that go backwards).
    ordered = sorted(anchors.items(), key=lambda kv: kv[0])
    clean: dict[tuple[int, int], float] = {}
    last = -1.0
    for k, t in ordered:
        if t >= last - 0.05:
            clean[k] = t
            last = t
    return clean
