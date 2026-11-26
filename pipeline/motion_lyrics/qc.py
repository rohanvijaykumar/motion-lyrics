"""Visual QC measurements on rendered frames.

For every checked moment the CLI renders two images:
  * the real frame, and
  * a mask frame where each line on screen is drawn in its own flat colour on
    black (see src/core/qc.ts), with every effect switched off.
From the mask we know exactly where each line's letters landed; from the real
frame we can judge how readable they are against the picture behind them.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import log
from .log import read_json, write_json

SAFE = 0.05  # title-safe inset on every side
MIN_CONTRAST = 2.5


def _lum(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def _dilate(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def measure(items: list[dict]) -> list[dict]:
    results = []
    for it in items:
        mask = np.asarray(Image.open(it["mask"]).convert("RGB")).astype(np.int16)
        frame = np.asarray(Image.open(it["frame"]).convert("RGB")) if it.get("frame") else None
        H, W = mask.shape[:2]
        res = {"id": it["id"], "t": it["t"], "lines": [], "problems": []}
        boxes = {}
        for ln in it["lines"]:
            r, g, b = ln["color"]
            hit = (np.abs(mask[..., 0] - r) < 60) & (np.abs(mask[..., 1] - g) < 60) & (np.abs(mask[..., 2] - b) < 60)
            # Ignore antialiasing specks: need a real amount of letter pixels.
            n = int(hit.sum())
            entry = {"line": ln["lineId"], "pixels": n}
            if n < 30:
                res["problems"].append({"line": ln["lineId"], "kind": "not-visible", "detail": "the line is not on screen at this moment"})
                res["lines"].append(entry)
                continue
            ys, xs = np.nonzero(hit)
            x0, x1, y0, y1 = xs.min() / W, (xs.max() + 1) / W, ys.min() / H, (ys.max() + 1) / H
            entry["box"] = [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)]
            boxes[ln["lineId"]] = (x0, y0, x1, y1)
            edges = [e for e, v in (("left", x0), ("top", y0), ("right", 1 - x1), ("bottom", 1 - y1)) if v < SAFE]
            if x0 <= 0.002 or y0 <= 0.002 or x1 >= 0.998 or y1 >= 0.998:
                res["problems"].append({"line": ln["lineId"], "kind": "clipped", "edges": edges, "detail": f"letters touch the {'/'.join(edges)} edge of the frame"})
            elif edges:
                res["problems"].append({"line": ln["lineId"], "kind": "outside-safe-area", "edges": edges, "detail": f"text reaches {min(x0, y0, 1 - x1, 1 - y1) * 100:.1f}% from the {'/'.join(edges)} edge (keep at least 5%)"})
            if ln.get("fontPx") is not None and ln["fontPx"] < ln.get("minFontPx", 0):
                res["problems"].append({"line": ln["lineId"], "kind": "too-small", "detail": f"font is {ln['fontPx']:.0f}px; at least {ln['minFontPx']:.0f}px reads well at this size"})
            if frame is not None and ln.get("active", True):
                fh, fw = frame.shape[:2]
                if (fh, fw) != (H, W):
                    frame = np.asarray(Image.fromarray(frame).resize((W, H)))
                ring = _dilate(hit, max(3, W // 160)) & ~_dilate(hit, max(1, W // 480))
                if ring.sum() > 20:
                    lt = float(np.median(_lum(frame[hit])))
                    lb = float(np.median(_lum(frame[ring])))
                    contrast = (max(lt, lb) + 0.05) / (min(lt, lb) + 0.05)
                    entry["contrast"] = round(contrast, 2)
                    if contrast < MIN_CONTRAST:
                        res["problems"].append({"line": ln["lineId"], "kind": "low-contrast", "detail": f"contrast {contrast:.1f}:1 against the picture (aim for {MIN_CONTRAST}:1 or more)"})
            for fb in it.get("faces", []):
                fx0, fy0, fx1, fy1 = fb[0], fb[1], fb[0] + fb[2], fb[1] + fb[3]
                ix = max(0.0, min(x1, fx1) - max(x0, fx0))
                iy = max(0.0, min(y1, fy1) - max(y0, fy0))
                if ix * iy > 0.25 * fb[2] * fb[3]:
                    entry["coversFace"] = True
            res["lines"].append(entry)
        ids = list(boxes)
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = boxes[ids[i]], boxes[ids[j]]
                ix = min(a[2], b[2]) - max(a[0], b[0])
                iy = min(a[3], b[3]) - max(a[1], b[1])
                if ix > 0 and iy > 0.25 * min(a[3] - a[1], b[3] - b[1]):
                    res["problems"].append({"line": ids[j], "kind": "collision", "detail": f"overlaps line {ids[i]}"})
        results.append(res)
    return results


def annotate(frame: Path, result: dict, out: Path) -> None:
    """Draw line boxes (green = fine, red = problem) and the safe area on a frame."""
    im = Image.open(frame).convert("RGB")
    W, H = im.size
    d = ImageDraw.Draw(im)
    d.rectangle([SAFE * W, SAFE * H, (1 - SAFE) * W, (1 - SAFE) * H], outline=(255, 255, 255), width=1)
    bad = {p["line"] for p in result["problems"]}
    for ln in result["lines"]:
        if "box" not in ln:
            continue
        x, y, w, h = ln["box"]
        d.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline=(255, 60, 60) if ln["line"] in bad else (60, 255, 120), width=3)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, quality=88)


def run(job: Path, out: Path) -> None:
    items = read_json(job)
    results = measure(items)
    for it, res in zip(items, results):
        if res["problems"] and it.get("frame") and it.get("annotated"):
            annotate(Path(it["frame"]), res, Path(it["annotated"]))
    write_json(out, results)
    n = sum(len(r["problems"]) for r in results)
    log.info(f"Measured {len(results)} frames; {n} problem(s)")


def compare(pairs_file: Path, out: Path) -> None:
    """Mean difference between QC stills and frames taken from the final video."""
    pairs = read_json(pairs_file)
    res = []
    for p in pairs:
        a = Image.open(p["still"]).convert("L").resize((480, 270 if p.get("landscape", True) else 854))
        b = Image.open(p["video"]).convert("L").resize(a.size)
        diff = float(np.mean(np.abs(np.asarray(a, dtype=np.int16) - np.asarray(b, dtype=np.int16))))
        res.append({"id": p["id"], "t": p["t"], "diff": round(diff, 2)})
    write_json(out, res)


def font_coverage(fonts: list[str], text: str) -> dict:
    """Which characters of `text` each font file contains (for fonts in a project's fonts/ folder)."""
    from fontTools.ttLib import TTFont

    out = {}
    chars = sorted({c for c in text if not c.isspace()})
    for f in fonts:
        try:
            tt = TTFont(f, fontNumber=0, lazy=True)
            cmap = tt.getBestCmap() or {}
            out[f] = [c for c in chars if ord(c) not in cmap]
        except Exception as e:  # unreadable font file
            out[f] = {"error": str(e)}
    return out
