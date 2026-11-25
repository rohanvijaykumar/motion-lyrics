# motion-lyrics

**Lyric videos for any video, in any language, from one command.** Give it a video and its
lyrics. It isolates the singer, times every word, checks its own work, points to the exact lines
worth double-checking, and renders a polished lyric video with [Remotion](https://www.remotion.dev).

![Presets](docs/images/presets.jpg)

- **Any language, any script.** Hindi, Arabic, Japanese, Tamil, Thai, Spanish, Chinese, Korean,
  Hebrew... Right-to-left wipes, correct shaping, the right Noto font for every script, and
  translations shown under the sung line.
- **Timing you can trust.** Vocal isolation, a multilingual forced aligner and Whisper
  cross-checking. Lines that might be off are flagged with a picture of the vocal so you can see
  why. On a hand-timed benchmark, 99.5% of unflagged words land within 0.3 s.
- **Many styles, not one.** Nine presets (karaoke fills, social captions, kinetic type, a
  scrolling sheet, cinematic, neon...) built from parts you can mix: layouts, entrances, exits,
  highlights, sparkles, glints, particles, grain and beat pulses.
- **Graphics too.** Titles, lower thirds, logos, free text, Lottie animations and credits.
- **Hands-free, but checkable.** One command does everything, and every step leaves files you
  can inspect, edit and re-run. Built for people and for AI agents (see [AGENTS.md](AGENTS.md)).

## Quick start

You need [Node.js](https://nodejs.org) 20+, [git](https://git-scm.com) and
[uv](https://docs.astral.sh/uv/getting-started/installation/) (uv installs Python for you).
The first setup downloads about 3 GB of models.

```bash
git clone https://github.com/rohanvijaykumar/motion-lyrics.git
cd motion-lyrics
npm install
npm run setup          # Python pipeline, models, headless browser
npm run doctor         # checks everything is ready
```

Install uv if you do not have it:

```bash
# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

See the demo (needs only `npm install`):

```bash
npm run studio
```

## Make a video

1. Write the lyrics in a text file, one sung line per line, with a blank line between screens:

   ```text
   @lang: hi, en
   हर आवाज़ में रोशनी है
   Light in every voice

   Every step is new
   > Cada paso es nuevo
   ```

   `>` marks a translation shown under the line above. Full format: [docs/lyrics-format.md](docs/lyrics-format.md).

2. Run:

   ```bash
   npm run make -- my-song --video path/to/video.mp4 --lyrics path/to/lyrics.txt
   ```

3. Open `projects/my-song/review/report.md`. It lists any lines to **check**, each with a timing
   strip, plus a contact sheet of every lyric screen. Fix a line if needed, then render again:

   ```bash
   npm run shift -- my-song --line g3l1 --by 0.2
   npm run render -- my-song
   ```

The finished video is in `projects/my-song/out/`.

Choose a look with `--preset` (`npm run presets` lists them), or edit `projects/my-song/project.json`:

```jsonc
"style": { "preset": "cinematic", "text": { "primary": { "fontSize": 90 } } },
"graphics": [{ "type": "title", "title": "Song title", "subtitle": "Artist", "start": 0, "end": 3 }]
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run make -- <name> --video <f> --lyrics <f>` | everything: create, align, review pack, render |
| `npm run make -- <name>` | re-run an existing project (finished steps are skipped) |
| `npm run align -- <name>` | re-align and rebuild the review pack, without rendering |
| `npm run studio -- <name>` | live preview in the browser |
| `npm run render -- <name> [--draft] [--from 10 --to 20]` | render (draft = half size with the timing overlay) |
| `npm run still -- <name> --time 12.5 [--debug]` | one frame as an image |
| `npm run shift -- <name> --line <id> --by <s>` | nudge timing (also `--word`, `--from`/`--to`) |
| `npm run review` / `validate` / `presets` / `doctor` / `bench` | review pack, checks, list styles, environment, accuracy benchmark |

Useful `make` options: `--preset`, `--audio song.mp3` (instead of a video; you get an animated
background), `--lang hi,en`, `--draft`, `--no-render`, `--fast` (skip Whisper: quicker but less
checked) and `--force`.

## Docs

- [AGENTS.md](AGENTS.md): the step-by-step process with checks, for AI agents and people
- [docs/lyrics-format.md](docs/lyrics-format.md): writing lyrics.txt
- [docs/styles.md](docs/styles.md): presets and every style option
- [docs/graphics.md](docs/graphics.md): titles, logos, lower thirds, Lottie, credits
- [docs/languages.md](docs/languages.md): scripts, fonts, right-to-left, per-character karaoke
- [docs/pipeline.md](docs/pipeline.md): how it works, accuracy numbers, hardware

## Using it with an AI agent

Open the folder in Claude Code (or any coding agent) and ask, for example, *"Make a lyric video
from ~/Videos/song.mp4 with these lyrics, cinematic style."* The agent follows
[AGENTS.md](AGENTS.md). Claude Code also picks up the `/motion-lyrics` skill from `.claude/skills/`.
For Remotion know-how inside the agent, run `npx remotion skills add`.

## Licenses

The code is MIT. It runs software with its own terms: **Remotion is free for individuals,
non-profits and companies of up to 3 people; larger companies need a
[Remotion license](https://www.remotion.dev/license)**, and **the MMS alignment model is
CC BY-NC 4.0 (non-commercial)**. Details and credits: [THIRD_PARTY.md](THIRD_PARTY.md).

This project uses the universal romanizer software 'uroman' written by Ulf Hermjakob, USC
Information Sciences Institute (2015-2020).
