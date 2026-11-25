"""Turn lyrics in any script into the Latin letters the aligner understands.

The multilingual aligner (MMS) was trained on romanized text, so every word is
passed through ``uroman`` first. That is what lets one model align Hindi,
Arabic, Tamil, Thai, Japanese, Russian and over a thousand other languages.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

_DIGITS_EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]


@lru_cache(maxsize=1)
def _uroman():
    import uroman

    return uroman.Uroman()


@lru_cache(maxsize=256)
def iso639_3(lang: str | None) -> str | None:
    """'hi' -> 'hin', 'en-US' -> 'eng'. Returns None when unknown."""
    if not lang:
        return None
    try:
        import langcodes

        code = langcodes.Language.get(lang).to_alpha3()
        return code or None
    except Exception:
        return None


def romanize(text: str, lang: str | None) -> str:
    code = iso639_3(lang)
    try:
        out = _uroman().romanize_string(text, lcode=code)
    except Exception:
        out = _uroman().romanize_string(text)
    return str(out)


def to_tokens(text: str, lang: str | None, vocab: set[str]) -> str:
    """Romanize, then keep only characters the aligner has in its vocabulary."""
    rom = romanize(text, lang)
    # Strip accents that survive romanization (e.g. "é" -> "e").
    rom = unicodedata.normalize("NFKD", rom)
    rom = "".join(ch for ch in rom if not unicodedata.combining(ch)).lower()
    rom = rom.replace("’", "'").replace("`", "'")
    if lang and lang.lower().startswith("en"):
        rom = re.sub(r"\d", lambda m: " " + _DIGITS_EN[int(m.group())] + " ", rom)
    return "".join(ch for ch in rom if ch in vocab)
