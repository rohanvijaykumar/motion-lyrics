"""Forced alignment: find exactly when each known lyric word is sung.

We already know the words (the user supplies the lyrics), so the job is not
speech recognition but *alignment*: place every word on the timeline. We use
Meta's MMS forced-alignment model (via torchaudio), which covers 1,100+
languages through romanized text, and a CTC Viterbi search written here in
NumPy so nothing needs a C++ compiler.

Pipeline position: separate -> analyze -> **align** -> refine.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import log
from .romanize import to_tokens

SR = 16000
HOP = 320  # samples per emission frame (20 ms)
FRAME_S = HOP / SR
RECEPTIVE = 400  # samples in the first conv window


@dataclass
class Word:
    id: str
    text: str
    tokens: str
    start: float = 0.0
    end: float = 0.0
    char_end: float = 0.0
    score: float = 0.0
    voiced: float = 1.0
    flags: list[str] = field(default_factory=list)


@dataclass
class Line:
    id: str
    lang: str | None
    words: list[Word]


# --------------------------------------------------------------------------- model


_MODEL = None


def _load_model(device: str):
    global _MODEL
    if _MODEL is None:
        import torchaudio

        bundle = torchaudio.pipelines.MMS_FA
        log.info("Loading MMS forced-alignment model (first run downloads about 1.2 GB)")
        model = bundle.get_model(with_star=False).to(device)
        model.eval()
        labels = bundle.get_labels(star=None)
        _MODEL = (model, labels)
    return _MODEL


def emissions(wav16k: np.ndarray, device: str = "cpu", chunk_s: float = 30.0, ctx_s: float = 2.0) -> np.ndarray:
    """Frame-level log-probabilities (frames x labels) for mono 16 kHz audio.

    Long songs are processed in overlapping chunks so memory stays flat; each
    chunk sees ``ctx_s`` seconds of context on both sides and only its centre
    frames are kept, so chunk borders do not degrade accuracy.

    The waveform is normalized once over the whole song. (The stock wrapper
    normalizes each chunk separately, which blows a silent intro up into loud
    noise that the model then "hears" lyrics in.)
    """
    import torch

    model, _ = _load_model(device)
    inner = model.model  # the raw wav2vec2 network, without per-chunk normalization
    wav16k = (wav16k - float(np.mean(wav16k))) / (float(np.std(wav16k)) + 1e-7)
    n = len(wav16k)
    total = max(1, (n - RECEPTIVE) // HOP + 1)
    chunk_f = int(chunk_s / FRAME_S)
    ctx_f = int(ctx_s / FRAME_S)
    out: list[np.ndarray] = []
    with torch.inference_mode():
        for a in range(0, total, chunk_f):
            b = min(total, a + chunk_f)
            fa = max(0, a - ctx_f)
            fb = min(total, b + ctx_f)
            s0 = fa * HOP
            s1 = min(n, (fb - 1) * HOP + RECEPTIVE)
            x = torch.from_numpy(np.ascontiguousarray(wav16k[s0:s1])).float()[None].to(device)
            em, _ = inner(x)
            em = torch.log_softmax(em, dim=-1)[0].float().cpu().numpy()
            rows = em[a - fa : a - fa + (b - a)]
            if rows.shape[0] < b - a:  # pad the very end if the model returned fewer frames
                pad = np.repeat(rows[-1:], (b - a) - rows.shape[0], axis=0)
                rows = np.concatenate([rows, pad])
            out.append(rows)
    return np.concatenate(out)


def voicing_prior(
    logp: np.ndarray, vocal_db: np.ndarray, hop_s: float, penalty: float = 6.0, silence_penalty: float = 40.0
) -> np.ndarray:
    """Make letters expensive where the isolated vocal is silent.

    ``vocal_db`` is the vocal loudness at ``hop_s`` resolution. Frames well
    below the singing level get up to ``penalty`` subtracted from every letter
    (not from blank), so words cannot be placed in intros, breaks or gaps.
    Frames at the noise floor (true silence) get ``silence_penalty``, which
    effectively forbids letters there. Voiced regions are widened by 60 ms
    because consonant onsets are quiet.
    """
    floor = float(np.percentile(vocal_db, 10))
    peak = float(np.percentile(vocal_db, 95))
    lo, hi = floor + 0.15 * (peak - floor), floor + 0.35 * (peak - floor)
    T = logp.shape[0]
    idx = np.minimum((np.arange(T) * FRAME_S / hop_s).astype(int), len(vocal_db) - 1)
    idx2 = np.minimum(idx + 1, len(vocal_db) - 1)
    db = np.maximum(vocal_db[idx], vocal_db[idx2])
    unvoiced = np.clip((hi - db) / max(1e-6, hi - lo), 0.0, 1.0)
    k = 3  # +-60 ms
    padded = np.pad(unvoiced, k, mode="edge")
    unvoiced = np.min(np.stack([padded[i : i + T] for i in range(2 * k + 1)]), axis=0)
    silent = db < floor + 0.08 * (peak - floor)
    padded = np.pad(silent, k, mode="edge")
    silent = np.min(np.stack([padded[i : i + T] for i in range(2 * k + 1)]), axis=0).astype(bool)
    out = logp.copy()
    out[:, 1:] -= (penalty * unvoiced + silence_penalty * silent)[:, None]
    return out


# ----------------------------------------------------------------------- viterbi


def ctc_viterbi(
    logp: np.ndarray,
    targets: np.ndarray,
    blank: int = 0,
    windows: tuple[np.ndarray, np.ndarray] | None = None,
    window_penalty: float = 4.0,
) -> np.ndarray:
    """Best CTC path. Returns, for each frame, the target index it emits or -1 for blank.

    ``windows`` = (first frame, last frame) per target; emitting a target
    outside its window costs ``window_penalty`` per frame (soft anchoring).
    Use -1 / a huge value for targets without a window.
    """
    T = logp.shape[0]
    L = len(targets)
    if L == 0:
        return np.full(T, -1, dtype=np.int64)
    S = 2 * L + 1
    ext = np.full(S, blank, dtype=np.int64)
    ext[1::2] = targets
    # Minimum frames needed: one per token, plus one between repeated tokens.
    repeats = int(np.sum(targets[1:] == targets[:-1]))
    if T < L + repeats:
        raise ValueError(
            f"Audio is too short for the lyrics: {T} frames for {L + repeats} required tokens. "
            "Check the lyrics belong to this song."
        )
    skip_ok = np.zeros(S, dtype=bool)
    skip_ok[3::2] = targets[1:] != targets[:-1]

    w0 = w1 = None
    if windows is not None:
        w0 = np.full(S, -1.0)
        w1 = np.full(S, 1e12)
        w0[1::2], w1[1::2] = windows[0], windows[1]
        anchored = bool(np.any(w0 >= 0))
        if not anchored:
            w0 = w1 = None

    def emit(t: int) -> np.ndarray:
        e = logp[t, ext]
        if w0 is not None:
            e = e - window_penalty * ((t < w0) | (t > w1))
        return e

    neg = -1e30
    dp = np.full(S, neg)
    e0 = emit(0)
    dp[0] = e0[0]
    dp[1] = e0[1]
    back = np.zeros((T, S), dtype=np.int8)
    for t in range(1, T):
        stay = dp
        one = np.concatenate(([neg], dp[:-1]))
        two = np.concatenate(([neg, neg], dp[:-2]))
        two = np.where(skip_ok, two, neg)
        cand = np.stack([stay, one, two])
        arg = np.argmax(cand, axis=0)
        dp = cand[arg, np.arange(S)] + emit(t)
        back[t] = arg
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    path = np.empty(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    return np.where(path % 2 == 1, path // 2, -1)


# --------------------------------------------------------------------- alignment


# Settings used by `npm run make` (chosen with the benchmark, see bench.py).
PRODUCTION: dict = {"star": "none"}

# Named alignment settings, compared by the benchmark (see bench.py).
VARIANTS: dict[str, dict] = {
    "no-vad": {"vad": 0, "align": {"star": "none"}},
    "vad": {"vad": 6.0, "align": {"star": "none"}},
    "vad+refine": {"vad": 6.0, "align": {"star": "none"}, "refine": True},
    "vad+star-lines": {"vad": 6.0, "align": {"star": "lines", "star_logp": -2.0}, "refine": True},
    "vad+star-words": {"vad": 6.0, "align": {"star": "words", "star_logp": -2.0}, "refine": True},
    "anchored": {"vad": 6.0, "align": {"star": "none"}, "refine": True, "anchors": True},
    "anchored+star-words": {"vad": 6.0, "align": {"star": "words", "star_logp": -2.0}, "refine": True, "anchors": True},
}


def align_lines(
    lines: list[Line],
    logp: np.ndarray,
    labels: tuple[str, ...],
    star: str = "none",
    star_logp: float = -2.0,
    anchors: dict[tuple[int, int], float] | None = None,
    anchor_window: float = 0.6,
    anchor_penalty: float = 4.0,
) -> None:
    """Fill start/end/score on every word in place.

    ``star`` adds a wildcard token that can soak up audio the lyrics do not
    describe (ad-libs, backing vocals, instrumental bleed): "lines" puts one
    between lines, "words" between every word. ``star_logp`` is its per-frame
    log-probability; lower values make it a last resort.
    """
    vocab = {c: i for i, c in enumerate(labels) if c not in ("-", "*")}
    vset = set(vocab)
    if star != "none":
        star_id = logp.shape[1]
        logp = np.concatenate([logp, np.full((logp.shape[0], 1), star_logp, dtype=logp.dtype)], axis=1)
    targets: list[int] = []
    owner: list[tuple[int, int] | None] = []  # (line index, word index) per target; None = star
    for li, line in enumerate(lines):
        if star != "none":
            targets.append(star_id)
            owner.append(None)
        for wi, w in enumerate(line.words):
            w.tokens = to_tokens(w.text, line.lang, vset)
            if star == "words" and wi > 0:
                targets.append(star_id)
                owner.append(None)
            for ch in w.tokens:
                targets.append(vocab[ch])
                owner.append((li, wi))
    if star != "none":
        targets.append(star_id)
        owner.append(None)
    if not any(o is not None for o in owner):
        log.fail("None of the lyric words could be romanized. Check the lyrics file and language tags.")

    windows = None
    if anchors:
        w0 = np.full(len(targets), -1.0)
        w1 = np.full(len(targets), 1e12)
        seen: set[tuple[int, int]] = set()
        for k, o in enumerate(owner):
            if o is None or o not in anchors:
                continue
            t_a = anchors[o] / FRAME_S
            first_letter = o not in seen
            seen.add(o)
            w0[k] = t_a - anchor_window / FRAME_S
            w1[k] = t_a + (anchor_window if first_letter else anchor_window + 3.0) / FRAME_S
        windows = (w0, w1)
    log.info(f"Aligning {sum(len(l.words) for l in lines)} words ({sum(o is not None for o in owner)} letters) "
             f"over {logp.shape[0] * FRAME_S:.1f}s" + (f" with {len(anchors)} anchors" if anchors else ""))
    frame_target = ctc_viterbi(logp, np.asarray(targets, dtype=np.int64), windows=windows, window_penalty=anchor_penalty)

    first: dict[tuple[int, int], int] = {}
    last: dict[tuple[int, int], int] = {}
    scores: dict[tuple[int, int], list[float]] = {}
    tarr = np.asarray(targets)
    for t, k in enumerate(frame_target):
        if k < 0 or owner[k] is None:
            continue
        key = owner[k]
        first.setdefault(key, t)
        last[key] = t
        scores.setdefault(key, []).append(float(logp[t, tarr[k]]))

    for li, line in enumerate(lines):
        for wi, w in enumerate(line.words):
            key = (li, wi)
            if key in first:
                w.start = first[key] * FRAME_S
                w.char_end = (last[key] + 1) * FRAME_S
                w.end = w.char_end
                w.score = float(np.exp(np.mean(scores[key])))
            else:
                w.flags.append("unalignable")  # no letters survived romanization

    _interpolate_missing(lines)


def _interpolate_missing(lines: list[Line]) -> None:
    """Words with no alignable letters (e.g. symbols) share time with their neighbours."""
    flat = [w for l in lines for w in l.words]
    for i, w in enumerate(flat):
        if "unalignable" not in w.flags:
            continue
        prev = next((flat[j] for j in range(i - 1, -1, -1) if "unalignable" not in flat[j].flags), None)
        nxt = next((flat[j] for j in range(i + 1, len(flat)) if "unalignable" not in flat[j].flags), None)
        a = prev.char_end if prev else (nxt.start - 0.3 if nxt else 0.0)
        b = nxt.start if nxt else a + 0.3
        w.start, w.end, w.char_end, w.score = a, max(a + 0.05, b), max(a + 0.05, b), 0.0
