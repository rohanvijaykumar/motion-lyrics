# AGENTS.md - the playbook for AI agents

This file tells an AI coding agent (Claude Code, Codex, Cursor, Gemini, ...)
exactly how to turn a video and its lyrics into a finished lyric video with
this repository, without guessing. Follow the stages in order. Each stage
ends with a **gate**: do not move on until the gate passes.

**The person you are helping may not be technical.** They were told to give you this
repository's link and talk to you. Do everything for them: install, set up, make, check,
render, change and clean up. Speak in plain language, never ask them to run commands
themselves, and never paste raw logs at them. Ask only the questions in section 3, and
explain choices in everyday words.

---

## Start here: from a bare machine

If the person gave you only the link (or "set up motion-lyrics"):

1. Clone it into a sensible folder (their Documents, or where they say):
   `git clone https://github.com/rohanvijaykumar/motion-lyrics.git`.
   No git? On Windows install it with `winget install --id Git.Git -e`; on macOS run
   `xcode-select --install`; or download the ZIP from GitHub and unzip it.
2. Run the one-step setup from the repository folder. It installs whatever is missing
   (Node.js, Git on Windows, uv and Python), then the packages, about 3 GB of models and the
   render browser:
   - Windows: `powershell -ExecutionPolicy Bypass -File setup.ps1`
   - macOS / Linux: `sh setup.sh`
   This takes 5 to 20 minutes. Tell the person it is downloading once, then carry on.
3. **Gate:** it ends with `Everything is ready.` If something fails, read the message, fix it
   (install the missing program, retry the download) and run it again.

Then ask for their video and lyrics (a file, or pasted text you save as `lyrics.txt`) and
continue with section 2.

## What people ask for, and what you do

| They say | You do |
| --- | --- |
| "Make a lyric video from this video with these lyrics" | Sections 2-6 |
| "Bigger / smaller lyrics" | `style.text.primary.fontSize` (and `secondary`) in project.json, then section 6 |
| "Use this font" / sends a font file | Google font name, or copy the file into `projects/<name>/fonts/`; set `style.text.*.fontFamily` |
| "Change the colour" | `sungColor` (sung words) and `color` (not yet sung) |
| "Move the lyrics to the top/centre" | `style.layout.position` |
| "Try another style" | `style.preset`; show the gallery in README.md or run `npm run presets` |
| "Add a title / song name at the start" | a `title` graphic in `graphics` (docs/graphics.md) |
| "Add our logo" | copy it into `projects/<name>/media/`, add an `image` graphic |
| "Add the singer's name" | a `lowerThird` graphic |
| "Add credits at the end" | a `credits` graphic |
| "Show the English translation" | add `> translation` lines under the sung lines in lyrics.txt, `npm run align` |
| "Just subtitles" / "captions for Reels" | presets `minimal-subtitles` / `social-pop` |
| "Make a vertical / TikTok / Reels version" | `npm run render -- <name> --size 1080 --aspect 9:16` |
| "4K" / "all sizes" | `--size 4k` / `--all` |
| "This line is early/late" | section 5 (`npm run shift`), then render |
| "Done, it's perfect" | section 7 (approve and clean up) |

After any change: `npm run validate -- <name>`, then render (which runs QC), look at the QC
frames, and show the person a still of the change (`npm run still -- <name> --time <s>`) before
or along with the new video.

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

Use "Start here" above. If the repository is already cloned and Node.js is installed:

```bash
npm install
npm run setup        # installs uv/Python if needed, ~3 GB of models, the render browser, JSON schemas
npm run doctor       # must end with "Everything is ready."
```

**Gate:** `npm run doctor` passes.

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

## 3. Ask the person first (required)

Before running anything for a new video, ask the person and wait for their answers:

1. **Style**: which preset? Show them `npm run presets` (or the gallery in README.md).
2. **Position**: lyrics at the bottom, center or top? They stay there for the whole video.
3. **Face avoidance**: on or off? On lets lyrics jump to the other end of the frame when a face
   is underneath, which makes positions change during the video. Default and recommended: off.
4. Optional: a **font** (Google Fonts name or a font file), a highlight **colour**, and the
   **export sizes** they need (1080p / 4K, 16:9 / 9:16).

Never choose these for them silently. Pass the answers as flags in the next step.

## 4. Make it

```bash
npm run make -- <name> --video <path/to/video.mp4> --lyrics <path/to/lyrics.txt> \
  --preset <preset> --position bottom --avoid-faces off [--font "<font>"] [--color "#hex"] --no-render
```

- `<name>`: short project name, e.g. `my-song`. The project goes to `projects/<name>/`.
- Audio-only song? Use `--audio song.mp3` instead of `--video`; you get an animated background.
- `--no-render` stops after the timing review so you can check timing first (recommended for agents).

What it does: copies/converts the video, extracts audio, isolates the vocal (Demucs), finds
beats, loudness and faces, listens with Whisper, aligns every word (MMS forced aligner with
Whisper anchors), builds `song.json`, and writes the timing review.

**Gate:** the command ends with `Done.` If it fails, read the error: every error says what to do.
See section 9 for common failures.

## 5. Timing review (the step that prevents mistakes)

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

**Gate:** every Check line is fixed or confirmed. Tell the person which lines you changed and
that you cannot hear audio, so they should watch the video once with sound.

## 6. Render with visual QC

```bash
npm run render -- <name>                                 # the source size and shape
npm run render -- <name> --size 4k --aspect 9:16         # one other format
npm run render -- <name> --all                           # 1080p and 4K, 16:9 and 9:16
npm run render -- <name> --draft                         # quick half-size preview with the timing overlay
```

Every render (except drafts) first runs visual QC on a settled frame of **every lyric line** in
that format: on screen, inside the 5% safe area, not clipped, no collisions, readable contrast,
readable size, and every character covered by the intended font. Failures are fixed per screen
without moving lyrics (shrink to fit, dark backing, outline, or wider margins for the whole
video), re-rendered and re-checked up to three times. After the render, frames from the real
video are compared with the checked frames.

Then **look yourself** (QC measures, you judge): open `review/qc/<format>/report.md`, every image
in `review/qc/<format>/failed/`, and a few `*-frame.jpg` images, plus `review/contact-sheet.jpg`.
Confirm the text sits where the person asked, the font looks right, and scripts render properly
(no empty boxes, no broken joining in Arabic or Indic text). If something looks wrong that QC
did not catch, fix it in project.json (`adjust`, `style`) and run `npm run qc -- <name>` again.

**Gate:** each format's QC report says **PASS** (or every remaining problem is explained to the
person) and the render finished with `Saved ...`. Give the person the absolute paths.

## 7. Approve and clean up

Only after the person says they are happy with the video:

```bash
npm run approve -- <name> --yes
```

It refuses videos whose QC did not pass (unless `--force`), records the approval in
project.json, and deletes working files: audio and vocal copies, speech caches, render staging
and bundles, QC and review frame images, drafts and unapproved renders. It keeps project files,
reports, the contact sheet and approved videos. Add `--media` only if the person also wants the
copied source video removed. Never run it without the person's approval.

Temporary files never need manual cleanup: every command writes them to its own
`.cache/tmp/run-<id>` folder and deletes it when it ends (also on errors and Ctrl+C). A folder
left by a crash is removed by the next command, and `approve` also removes Remotion leftovers
older than six hours from the system temp folder. Never delete other files from the system temp
folder.

## 8. Changing the look

All in `projects/<name>/project.json` (autocomplete via `schema/project.schema.json`):

```jsonc
"style": {
  "preset": "golden-sparkle",
  "text": { "primary": { "fontSize": 88 }, "secondary": { "sungColor": "#ffd27a" } },
  "layout": { "position": "bottom", "avoidFaces": false },
  "effects": { "sparkles": { "enabled": false } }
},
"graphics": [
  { "type": "title", "title": "Song title", "subtitle": "Artist", "start": 0, "end": 3 },
  { "type": "image", "src": "media/logo.png", "start": 0, "end": 75, "at": { "x": 0.92, "y": 0.1 } }
]
```

Fonts: put font files in `projects/<name>/fonts/` (family = file name before the dash), or use
any Google Fonts name. Reusable looks: `presets/*.json`. House defaults:
`motion-lyrics.config.json`. Full reference: `docs/styles.md` and `docs/graphics.md`. After
editing, run `npm run validate -- <name>` then `npm run qc -- <name>`.

## 9. When something fails

| Symptom | Fix |
| --- | --- |
| `uv is not installed` | Install uv (command in the message), new terminal, `npm run setup` |
| Model download fails | Check the internet connection and re-run the same command; models already downloaded are kept |
| `Font loading failed` during render | Rendering needs internet for Google Fonts the first time |
| `Alignment is out of date for line ...` | Lyrics changed after aligning: `npm run align -- <name>` |
| Many Check lines everywhere | Wrong language tags or lyrics not matching the song. Compare lyrics.txt with the audio; fix `@lang`/`{lang}` |
| Words in an instrumental intro | Lyrics include a line that is not sung, or the vocal is very quiet: check lyrics; `--force` re-runs everything |
| Text covers a face | Ask the person: a different `position`, or `avoidFaces` on (positions may then change) |
| QC "font-not-found" | The font name is not a Google Font and no file is in `fonts/`: fix the spelling or add the file |
| QC problems remain after 3 rounds | Read `review/qc/<format>/report.md`; adjust `style` (sizes, margins) or `adjust` in project.json, then `npm run qc` |
| Video will not decode | The CLI converts unusual formats automatically; if it still fails, convert to H.264 MP4 first |

## 10. Extending the framework (code changes)

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
