"""Small helpers for readable progress output and safe JSON files."""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Windows consoles default to a legacy code page; lyrics are often not Latin.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover - not all streams support it
        pass

_T0 = time.time()


def info(msg: str) -> None:
    print(f"[{time.time() - _T0:6.1f}s] {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[{time.time() - _T0:6.1f}s] WARNING: {msg}", file=sys.stderr, flush=True)


def fail(msg: str, code: int = 1) -> "None":
    print(f"ERROR: {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    """Write JSON atomically so a crash never leaves a half-written file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)
