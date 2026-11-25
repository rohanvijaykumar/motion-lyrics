# projects/

Your lyric video projects live here, one folder each. This folder is ignored by git, so your
videos, lyrics and renders are never committed.

Create one with:

```bash
npm run make -- my-song --video path/to/video.mp4 --lyrics path/to/lyrics.txt
```

Each project contains `project.json` (settings you edit), `lyrics.txt`, `song.json` (timed
lyrics), `analysis.json`, `media/`, `work/` (intermediate audio and data), `review/` and `out/`.
