# AGENTS.md - the playbook for AI agents

This file tells an AI coding agent (Claude Code, Codex, Cursor, Gemini, ...)
exactly how to turn a video and its lyrics into a finished lyric video with
this repository, without guessing. Follow the stages in order. Each stage
ends with a **gate**: do not move on until the gate passes.

People can follow it too; every step is a single command.

---

## 0. Ground rules

- **Never invent lyrics.** Use the lyrics the person gives you, exactly as written. If they
  give none, the pipeline drafts them with speech recognition and you must tell them the
  draft needs checking.
- **Never edit `song.json` timing by hand-typing numbers you have not verified.** Use
  `npm run shift` (it validates and locks the line) and verify with a strip or a still.
- **Do not change files under `src/` to fix one video.** Styles, positions, colours, sizes and
  graphics are all set in the project's `project.json`. Change code only to add a new
  capability for everyone (see section 8).
- **Look before you claim.** Open the contact sheet and the timing strips (they are images)
  before saying the video is right. Report what you checked and what you could not check
  (you cannot hear audio; say so).
- Keep the person's media and lyrics inside `projects/`, which git ignores. Never commit them.

## 1. Setup (once per machine)

```bash
npm install
npm run setup        # Python pipeline via uv, ~3 GB of models, headless browser, JSON schemas
npm run doctor       # must end with "Everything is ready."
```

**Gate:** `npm run doctor` passes. If uv is missing, install it (the error message gives the
one-line command for each OS) and open a new terminal.

## 2. Write `lyrics.txt`

Format (full reference: `docs/lyrics-format.md`):

```text
@title: Song title
@artist: Artist
@lang: hi, en            # every language in the song, most common first

[Chorus]                 # optional section name for the next screen
हर आवाज़ में रोशनी है       # a sung line; language found from its script
Light in every voice     # another sung line on the same screen
> Luz en cada voz        # ">" = translation shown with the line above, not sung
                         # blank line = next screen
{es} Hola mundo          # {lang} tag: needed when two languages share a script
```

Rules that prevent most mistakes:

1. Lines in **the order they are sung**, every repeat written out (no "Chorus x2").
2. One screen = the lines that should be on screen together. Two to four short lines is ideal.
3. Languages sharing a script (English and Spanish are both Latin) need a `{lang}` tag on the
   lines that are not the first language in `@lang`. The CLI warns when this is ambiguous.
4. For Chinese/Japanese per-character karaoke, see `docs/languages.md`.

**Gate:** the file has the person's exact lyrics; `@lang` lists every language.

## 3. Make it

```bash
npm run make -- <name> --video <path/to/video.mp4> --lyrics <path/to/lyrics.txt> --preset <preset> --no-render
```

- `<name>`: short project name, e.g. `my-song`. The project goes to `projects/<name>/`.
- `--preset`: run `npm run presets` to list looks. Default `golden-sparkle`.
- Audio-only song? Use `--audio song.mp3` instead of `--video`; you get an animated background.
- `--no-render` stops after the review pack so you can check timing first (recommended for agents).

What it does: copies/converts the video, extracts audio, isolates the vocal (Demucs), finds
beats, loudness and faces, listens with Whisper, aligns every word (MMS forced aligner with
Whisper anchors), builds `song.json`, and writes the review pack.

**Gate:** the command ends with `Done.` If it fails, read the error: every error says what to do.
See section 7 for common failures.

## 4. Review (the step that prevents mistakes)

Open `projects/<name>/review/report.md`. It lists:

- **Check** lines - timing is likely off. Each has a strip image.
- **Glance** lines - less certain, usually fine. Watch them in the draft.

For every **Check** line, open its strip `review/strips/<line-id>.png`:

- Top: the isolated vocal as a spectrogram. Bright horizontal bands are sung notes; a new
  word normally starts where a new band (or a burst of brightness) starts.
- Row "lyrics": a box per word as aligned. Row "whisper": what speech recognition heard.
- **Correct** when each lyric box starts at the start of its note, in order.
- **Wrong** when boxes sit over darkness (silence), are squeezed into a sliver, or are
  shifted a whole note or more away from the bands while Whisper's row shows the same words
  elsewhere.

Fix with:

```bash
npm run shift -- <name> --line g3l1 --by 0.25           # whole line later by 0.25 s (negative = earlier)
npm run shift -- <name> --word g3l1w2 --start 12.40 [--end 12.90]
npm run shift -- <name> --from 40 --to 55 --by -0.2     # a whole passage
npm run shift -- <name> --line g3l1 --by 0              # confirm a line is right (locks it)
```

`shift` validates the result and marks the line `locked`, so re-running alignment keeps it.
After fixes, re-check with a still that has the timing overlay:

```bash
npm run still -- <name> --time 12.6 --debug
```

The overlay strip (top of frame) shows the vocal loudness curve and word boxes around the
playhead; red = check, orange = glance, green = confident.

Then open `review/contact-sheet.jpg`: one frame per lyric screen. Check that:

- every screen's text is fully inside the frame and readable,
- no text covers a face (lyrics move away from faces automatically; confirm it),
- the scripts render properly (no empty boxes, no broken joining in Arabic/Indic text).

**Gate:** every Check line is fixed or confirmed; the contact sheet looks right. Tell the
person which lines you changed and that you cannot hear audio, so they should watch the
draft once with sound.

## 5. Draft, then final render

```bash
npm run render -- <name> --draft     # half size + timing overlay -> projects/<name>/out/draft.mp4
npm run render -- <name>             # full quality -> projects/<name>/out/<name>.mp4
```

Partial renders for quick checks: `--from 30 --to 45`.

**Gate:** final render finishes with `Saved ...`. Give the person the absolute path.

## 6. Changing the look

All in `projects/<name>/project.json` (autocomplete via `schema/project.schema.json`):

```jsonc
"style": {
  "preset": "golden-sparkle",
  "text": { "primary": { "fontSize": 88 }, "secondary": { "sungColor": "#ffd27a" } },
  "layout": { "position": "top", "avoidFaces": true },
  "effects": { "sparkles": { "enabled": false } }
},
"graphics": [
  { "type": "title", "title": "Song title", "subtitle": "Artist", "start": 0, "end": 3 },
  { "type": "image", "src": "media/logo.png", "start": 0, "end": 75, "at": { "x": 0.92, "y": 0.1 } }
]
```

Full reference: `docs/styles.md` and `docs/graphics.md`. After editing, run
`npm run validate -- <name>` then a still or draft.

Live preview while editing: `npm run studio -- <name>` (refresh the browser after saving).

## 7. When something fails

| Symptom | Fix |
| --- | --- |
| `uv is not installed` | Install uv (command in the message), new terminal, `npm run setup` |
| Model download fails | Check the internet connection and re-run the same command; models already downloaded are kept |
| `Font loading failed` during render | Rendering needs internet for Google Fonts the first time |
| `Alignment is out of date for line ...` | Lyrics changed after aligning: `npm run align -- <name>` |
| Many Check lines everywhere | Wrong language tags or lyrics not matching the song. Compare lyrics.txt with the audio; fix `@lang`/`{lang}` |
| Words in an instrumental intro | Lyrics include a line that is not sung, or the vocal is very quiet: check lyrics; `--force` re-runs everything |
| Text covers a face | `"layout": { "position": "top" }` for that project, or keep `avoidFaces` on and lower `marginY` |
| Video will not decode | The CLI converts unusual formats automatically; if it still fails, convert to H.264 MP4 first |

## 8. Extending the framework (code changes)

- **New preset:** add an entry in `src/style/presets.ts` (only the fields that differ from
  defaults), add it to `docs/styles.md`, run `npm test`.
- **New animation part:** layout in `src/render/Page.tsx` / `Scroll.tsx`, entrance in
  `src/render/Word.tsx`, effects in `src/render/effects/`. Every animation must be a pure
  function of time (`t`), seeded randomness only (`src/core/random.ts`), no CSS transitions.
- **New language behaviour:** `src/core/script.ts` (scripts, fonts, direction) and
  `src/core/segment.ts` (word splitting). Add a test in `tests/core.test.ts`.
- **Alignment changes:** measure before and after with `npm run bench` (JamendoLyrics, hand-timed
  songs) and report both numbers. Do not merge a change that lowers accuracy or flag recall.

Always run `npm test` and `npx tsc --noEmit` before finishing.
