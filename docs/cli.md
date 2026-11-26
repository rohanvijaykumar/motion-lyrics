# Command reference (for developers and AI agents)

Most people never need this page: they ask their AI assistant, which runs these commands for
them (see [AGENTS.md](../AGENTS.md)). Everything here works by hand too.

## Setup

```bash
git clone https://github.com/rohanvijaykumar/motion-lyrics.git
cd motion-lyrics
# Windows:  powershell -ExecutionPolicy Bypass -File setup.ps1
# macOS/Linux:  sh setup.sh
```

The setup scripts install Node.js (and Git on Windows) if missing, then run `npm install` and
`npm run setup`, which installs uv and Python, about 3 GB of models and the render browser.
`npm run doctor` checks everything.

## Commands

| Command | What it does |
| --- | --- |
| `npm run make -- <name> --video <file> --lyrics <file>` | everything: asks the style questions, times, checks, renders |
| `npm run make -- <name>` | run an existing project again (finished steps are reused) |
| `npm run render -- <name> [--size 1080\|4k] [--aspect 16:9\|9:16] [--all]` | render (with visual QC) |
| `npm run render -- <name> --draft` | quick half-size preview with a timing overlay |
| `npm run qc -- <name> [--all] [--no-fix]` | visual QC only |
| `npm run approve -- <name> [--yes] [--media] [--force]` | approve the video and clean up (also old temporary files) |
| `npm run studio -- <name>` | live preview in the browser |
| `npm run shift -- <name> --line <id> --by <seconds>` | nudge timing (also `--word <id> --start/--end`, `--from/--to --by`) |
| `npm run still -- <name> --time 12.5 [--debug] [--size/--aspect]` | save one frame as an image |
| `npm run align -- <name>` | re-time the lyrics and rebuild the timing review |
| `npm run review -- <name>` / `validate -- <name>` | rebuild the timing review / check the project files |
| `npm run presets` | list built-in and your own presets |
| `npm run doctor` / `setup` / `schema` / `bench` | check setup, install, regenerate JSON schemas, accuracy benchmark |

## Options for `make` and `new`

| Option | Meaning |
| --- | --- |
| `--preset <name>` | style (built-in or from `presets/`) |
| `--position bottom\|center\|top` | where lyrics sit for the whole video |
| `--avoid-faces on\|off` | let lyrics move away from faces (default off) |
| `--font <Google font or file>` | main font |
| `--color "#hex"` | colour of sung words |
| `--size`, `--aspect`, `--all` | export sizes |
| `--audio song.mp3` | no video: animated or photo background |
| `--lang hi,en` | languages, if lyrics.txt has no `@lang` line |
| `--title`, `--artist` | song details |
| `--draft` | quick preview instead of the final render |
| `--no-render` | stop after the timing review |
| `--fast` | skip the Whisper cross-check (quicker, less safe) |
| `--force` | redo every step |
| `--yes` | do not ask the style questions (use flags and defaults) |

## Files in a project

See [pipeline.md](pipeline.md) for every file a project contains and what writes it.
