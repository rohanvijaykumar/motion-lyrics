"""Fast unit tests for the alignment core (no models are downloaded)."""

import numpy as np

from motion_lyrics import align as A
from motion_lyrics import refine
from motion_lyrics.anchors import sequence_match
from motion_lyrics.romanize import to_tokens
from motion_lyrics.verify import review_level

LETTERS = set("abcdefghijklmnopqrstuvwxyz'")


def test_romanize_many_scripts():
    cases = {
        ("हर आवाज़", "hi"): "haraavaaz",
        ("Hola, niño", "es"): "holanino",
        ("Привет", "ru"): "privet",
        ("24/7", "en"): "twofourseven",
    }
    for (text, lang), want in cases.items():
        assert to_tokens(text, lang, LETTERS) == want
    for text, lang in [("مرحبا", "ar"), ("こんにちは", "ja"), ("你好", "zh"), ("வணக்கம்", "ta"), ("สวัสดี", "th"), ("안녕", "ko")]:
        assert to_tokens(text, lang, LETTERS), f"{lang} produced no letters"


def _synthetic(targets, spans, T, V=5):
    """Emissions where target k is likely in its span and blank elsewhere."""
    logp = np.full((T, V), -8.0)
    logp[:, 0] = -0.01
    for k, (a, b) in enumerate(spans):
        logp[a:b, targets[k]] = -0.05
        logp[a:b, 0] = -6.0
    return logp


def test_viterbi_finds_the_planted_path():
    targets = np.array([1, 2, 2, 3])
    spans = [(5, 8), (12, 14), (20, 23), (30, 35)]
    path = A.ctc_viterbi(_synthetic(targets, spans, 50), targets)
    for k, (a, b) in enumerate(spans):
        frames = np.nonzero(path == k)[0]
        assert len(frames) and frames.min() >= a and frames.max() < b


def test_viterbi_rejects_audio_that_is_too_short():
    targets = np.array([1, 1, 1, 1])
    try:
        A.ctc_viterbi(np.zeros((5, 3)), targets)
    except ValueError as e:
        assert "too short" in str(e)
    else:
        raise AssertionError("expected an error")


def test_anchor_window_pulls_a_token():
    targets = np.array([1])
    logp = np.full((60, 3), -8.0)
    logp[:, 0] = -0.01
    logp[10:12, 1] = -0.5  # weaker evidence early
    logp[40:42, 1] = -0.6  # similar evidence late
    free = A.ctc_viterbi(logp, targets)
    assert np.nonzero(free == 0)[0].min() < 20
    windows = (np.array([35.0]), np.array([45.0]))
    anchored = A.ctc_viterbi(logp, targets, windows=windows, window_penalty=4.0)
    assert np.nonzero(anchored == 0)[0].min() >= 35


def test_voicing_prior_forbids_letters_in_silence():
    T = 100
    logp = np.zeros((T, 4))
    db = np.full(T * 2, -80.0)
    db[100:200] = -20.0  # voiced second half (10 ms hop)
    out = A.voicing_prior(logp, db, refine.HOP_S)
    assert out[10, 1] < -30  # silent frame: letters forbidden
    assert out[80, 1] == 0  # voiced frame untouched
    assert np.all(out[:, 0] == 0)  # blank never penalized


def test_sequence_match_handles_insertions():
    lyric = ["every", "voice", "can", "carry", "light"]
    heard = ["oh", "every", "voice", "carry", "lights"]
    pairs = sequence_match(lyric, heard)
    matched = {(i, j) for i, j, _ in pairs}
    assert (0, 1) in matched and (1, 2) in matched and (3, 3) in matched


def test_review_levels():
    def line(n_anchored, n=4, flags=()):
        words = [{"flags": list(flags) if i == 0 else [], "anchored": i < n_anchored} for i in range(n)]
        return {"words": words, "flags": []}

    assert review_level(line(4), listened=True) is None
    assert review_level(line(1), listened=True) == "glance"
    assert review_level(line(0, flags=["in-silence"]), listened=True) == "check"
    assert review_level(line(0), listened=False) is None
