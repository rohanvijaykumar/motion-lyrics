"""Refine aligned word times with the loudness of the isolated vocal.

The aligner is good at *where a word starts* but CTC models mark only the
letters' peaks, so sustained sung vowels end up looking short. Refinement:

  1. extends each word through the note it is holding, up to the next word;
  2. nudges a phrase's first word onto the vocal onset when the aligner put it
     inside silence (or just after the onset);
  3. measures how much of each word is actually voiced, which feeds the
     confidence score used to flag lines for review.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import audio

HOP_S = 0.01


@dataclass
class Envelope:
    db: np.ndarray  # loudness of the vocal stem, one value per 10 ms
    floor: float
    peak: float

    @classmethod
    def from_file(cls, vocals: Path) -> "Envelope":
        wav, sr = audio.load(vocals, sr=16000, mono=True)
        db = audio.rms_envelope(wav[0], sr, hop_s=HOP_S)
        return cls(db=db, floor=float(np.percentile(db, 10)), peak=float(np.percentile(db, 95)))

    def threshold(self, frac: float = 0.4) -> float:
        return self.floor + frac * (self.peak - self.floor)

    def voiced(self, frac: float = 0.4) -> np.ndarray:
        return self.db > self.threshold(frac)

    def idx(self, t: float) -> int:
        return int(np.clip(round(t / HOP_S), 0, len(self.db) - 1))


def refine(lines, env: Envelope, max_hold: float = 4.0, onset_back: float = 0.2, onset_fwd: float = 0.3) -> None:
    voiced = env.voiced()
    flat = [w for l in lines for w in l.words]
    line_first = {id(l.words[0]) for l in lines if l.words}

    for i, w in enumerate(flat):
        # --- 2. phrase onsets -------------------------------------------------
        if id(w) in line_first:
            prev_end = flat[i - 1].char_end if i > 0 else 0.0
            s = env.idx(w.start)
            if not voiced[s]:
                # Started in silence: move forward to the first voiced frame.
                e = env.idx(min(w.char_end, w.start + onset_fwd))
                hits = np.nonzero(voiced[s : e + 1])[0]
                if len(hits):
                    w.start = (s + int(hits[0])) * HOP_S
            else:
                # Started mid-note: walk back to where this note began.
                lo = env.idx(max(prev_end, w.start - onset_back))
                k = s
                while k > lo and voiced[k - 1]:
                    k -= 1
                if k > lo:  # found the silent gap before the onset
                    w.start = k * HOP_S

    for i, w in enumerate(flat):
        # --- 1. hold through the sustained note ------------------------------
        nxt = flat[i + 1].start if i + 1 < len(flat) else w.char_end + max_hold
        limit = min(nxt, w.char_end + max_hold)
        k = env.idx(w.char_end)
        stop = env.idx(limit)
        while k < stop and voiced[k]:
            k += 1
        end = max(w.char_end, k * HOP_S)
        # Close tiny gaps so the highlight flows straight into the next word.
        if nxt - end < 0.12:
            end = nxt
        w.end = round(min(end, nxt), 3)
        w.start = round(min(w.start, w.end - 0.02), 3)

        # --- 3. how much of the word is sung ---------------------------------
        a, b = env.idx(w.start), max(env.idx(w.start) + 1, env.idx(w.end))
        w.voiced = float(np.mean(voiced[a:b]))
