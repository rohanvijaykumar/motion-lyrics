"""Command line for the audio pipeline. Normally called by the Node CLI (`npm run make`).

    uv run --project pipeline python -m motion_lyrics <command> --project projects/<name>
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def main() -> None:
    p = argparse.ArgumentParser(prog="motion_lyrics")
    sub = p.add_subparsers(dest="cmd", required=True)

    def proj(sp):
        sp.add_argument("--project", type=Path, required=True)
        return sp

    s = proj(sub.add_parser("separate", help="isolate the lead vocal"))
    s.add_argument("--force", action="store_true")
    s.add_argument("--off", action="store_true", help="skip separation and use the full mix")

    a = proj(sub.add_parser("analyze", help="loudness, beats and faces"))
    a.add_argument("--video", type=Path)
    a.add_argument("--no-faces", action="store_true")
    a.add_argument("--duration", type=float, required=True)

    al = proj(sub.add_parser("align", help="time every lyric word"))
    al.add_argument("--no-anchors", action="store_true")

    v = proj(sub.add_parser("listen", help="Whisper transcription per language (anchors + second opinion)"))
    v.add_argument("--model", default="medium")

    t = proj(sub.add_parser("transcribe", help="draft lyrics.txt when no lyrics are given"))
    t.add_argument("--model", default="medium")
    t.add_argument("--language")

    st = proj(sub.add_parser("strips", help="timing pictures for lines"))
    st.add_argument("--lines", required=True, help="comma-separated line ids")

    sh = sub.add_parser("sheet", help="tile images into a contact sheet")
    sh.add_argument("--out", type=Path, required=True)
    sh.add_argument("--cols", type=int, default=4)
    sh.add_argument("images", type=Path, nargs="+")

    q = sub.add_parser("qc", help="measure QC frames (used by npm run qc)")
    q.add_argument("--job", type=Path, required=True)
    q.add_argument("--out", type=Path, required=True)

    qc2 = sub.add_parser("compare", help="compare QC stills with frames from the final video")
    qc2.add_argument("--job", type=Path, required=True)
    qc2.add_argument("--out", type=Path, required=True)

    fc = sub.add_parser("fontcheck", help="which characters font files are missing")
    fc.add_argument("--text-file", type=Path, required=True)
    fc.add_argument("fonts", nargs="+")

    pf = sub.add_parser("prefetch", help="download all models")
    pf.add_argument("--whisper", default="medium")

    sub.add_parser("doctor", help="report the Python environment")

    b = sub.add_parser("bench", help="measure alignment accuracy on JamendoLyrics")
    b.add_argument("--songs", type=int, default=3, help="songs per language (English, French, German, Spanish)")
    b.add_argument("--cache", type=Path, default=Path(__file__).resolve().parents[2] / ".cache" / "bench")
    b.add_argument("--out", type=Path, default=None)
    b.add_argument("--variants", default="production", help="production (with Whisper anchors) and/or no-anchors")
    b.add_argument("--whisper", default="medium")

    args = p.parse_args()
    from . import stages

    if args.cmd == "separate":
        stages.separate(args.project, force=args.force, enabled=not args.off)
    elif args.cmd == "analyze":
        stages.analyze(args.project, args.video, not args.no_faces, args.duration)
    elif args.cmd == "align":
        stages.align(args.project, use_anchors=not args.no_anchors)
    elif args.cmd == "listen":
        stages.listen(args.project, args.model)
    elif args.cmd == "transcribe":
        stages.transcribe_draft(args.project, args.model, args.language)
    elif args.cmd == "strips":
        stages.strips(args.project, [x for x in args.lines.split(",") if x])
    elif args.cmd == "sheet":
        stages.sheet(args.images, args.out, cols=min(args.cols, len(args.images)))
    elif args.cmd == "qc":
        from . import qc

        qc.run(args.job, args.out)
    elif args.cmd == "compare":
        from . import qc

        qc.compare(args.job, args.out)
    elif args.cmd == "fontcheck":
        from . import qc

        print(json.dumps(qc.font_coverage(args.fonts, args.text_file.read_text(encoding="utf-8")), ensure_ascii=False))
    elif args.cmd == "prefetch":
        stages.prefetch(args.whisper)
    elif args.cmd == "doctor":
        print(json.dumps(stages.doctor()))
    elif args.cmd == "bench":
        from .bench import run

        out = args.out or (args.cache / "report.json")
        run(args.songs, args.cache.resolve(), out.resolve(), args.variants.split(","), args.whisper)


if __name__ == "__main__":
    main()
