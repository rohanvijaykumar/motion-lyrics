# How it works

```
video.mp4 + lyrics.txt
   │
   ├─ media      probe; convert to H.264 if needed; extract audio (ffmpeg)
   ├─ separate   isolate the lead vocal (Demucs htdemucs)
   ├─ lyrics     parse lyrics.txt, split words for any language (Intl.Segmenter)
   ├─ analyze    vocal loudness, beats (librosa), faces over time (OpenCV YuNet)
   ├─ listen     Whisper transcribes the vocal once per language (faster-whisper)
   ├─ align      MMS forced alignment of every word, guided by Whisper anchors
   ├─ refine     hold sustained notes, snap phrase onsets to the vocal
   ├─ verify     confidence per word; "check" / "glance" level per line
   ├─ song.json  timed lyrics (+ translations timed with their sung line)
   ├─ review     report.md, contact sheet, timing strips for flagged lines
   ├─ qc         a frame of every lyric line per export format: position, size,
   │             contrast, fonts; fix and re-check (never moves lyrics)
   ├─ render     Remotion: React components draw every frame; ffmpeg encodes
   ├─ verify     frames from the finished video match the checked frames
   └─ approve    record the approved video; clean up working files
```

Every stage reads and writes files in the project folder, so any stage can be re-run alone
and every intermediate result can be inspected:

| File | Written by | Contents |
| --- | --- | --- |
| `project.json` | you / `new` | settings, style, graphics |
| `lyrics.txt` | you | the lyrics |
| `work/audio.wav` | media | the song's audio |
| `work/vocals.wav` | separate | the isolated vocal |
| `work/lyrics.json` | lyrics | words to align |
| `analysis.json` | analyze | loudness curve, beats, face boxes |
| `work/whisper-<lang>.json` | listen | what Whisper heard, with times |
| `work/alignment.json` | align | word times, scores, flags |
| `song.json` | build | the timed lyrics the renderer uses (safe to edit) |
| `review/` | review | report, contact sheet, strips |
| `review/qc/<format>/` | qc | QC report and images of any failed frames |
| `out/` | render | videos |

`make` skips stages whose outputs are newer than their inputs; `--force` redoes everything.

## Export formats and visual QC

`render` takes `--size 1080|4k`, `--aspect 16:9|9:16` or `--all`. The composition is laid out at
the target size (text is drawn at full resolution, never upscaled). Footage is placed by the
framing rules in `src/core/frame.ts`: `cover` crops to fill and follows the faces over time
(smoothed over about two seconds), `contain` shows the whole picture with bars, and `blur`
shows the whole picture over an enlarged, blurred copy.

Before each render, `scripts/lib/qc.ts` picks a settled moment for every sung line (after its
screen has finished entering, mid-line, before it leaves) and renders two frames: the real one
and a mask with each line in a flat colour on black. `pipeline/motion_lyrics/qc.py` measures
each line's exact pixel box from the mask, and judges contrast between the sung line's letters
and a ring of picture around them. Fonts are checked separately: each character is matched
against the Google Fonts unicode ranges or, for your own files, the font's character map
(fontTools). Fixes are written to `project.json` (`adjust` per screen, or wider margins for the
whole video) and never move lyrics. After the render, frames are taken from the finished file
at the same moments and compared with the checked frames.

## Why these choices

- **Forced alignment, not speech recognition.** The lyrics are known, so the job is to find
  *when* each word is sung, not *what* is sung. MMS (Pratap et al., 2023) aligns romanized text
  in 1,100+ languages; the CTC search is written in NumPy so nothing needs compiling.
- **Isolate the vocal first.** Drums and guitars confuse every speech model. Demucs removes them.
- **Voicing prior.** Letters cost more where the isolated vocal is quiet and are effectively
  forbidden in true silence, so words cannot drift into intros or breaks. The model's input is
  normalized once for the whole song: normalizing each chunk on its own turns a silent intro
  into loud noise that the model "hears" words in. (That bug cost 40 seconds of drift on one
  benchmark song before it was fixed.)
- **Whisper anchors.** Words Whisper hears clearly and that match the lyrics (compared in
  romanized form, so any script works) become soft anchors that stop long songs drifting.
- **Two review levels.** Lines most likely to be wrong are marked **check** and get a
  spectrogram strip; less certain lines are **glance**. The thresholds were calibrated on hand-timed songs.

## Accuracy

`npm run bench` downloads songs from [JamendoLyrics](https://github.com/f90/jamendolyrics)
(Durand, Stoller and Ewert, ICASSP 2023; every word timed by hand), runs the production recipe
and scores it. Results for one song per language (English, French, German, Spanish; 1,151 words)
on CPU with Whisper `medium`:

| Measure | Result |
| --- | --- |
| Words starting within 0.3 s of the hand timing | 84.4% |
| Median word start error | 0.043 s |
| Badly timed words (> 0.5 s off) that are in a flagged (check or glance) line | 98% |
| Words in unflagged lines within 0.3 s | 99.0% |
| Lines marked **check** on the two clearly sung songs | 3-4% |
| Best and worst song | 99.3% (Spanish pop) and 59.3% (dense English rock) |

What this means in practice: on clearly sung songs the timing is right almost everywhere; on
dense, heavily produced songs some passages need a manual nudge, and the review report points
to them. Run `npm run bench -- --songs 3` for the full 12-song set (slow on CPU).

## Hardware

Everything runs on CPU. For a 3-minute song expect roughly: separation 2-4 min, Whisper
`medium` 3-6 min per language, alignment under a minute, rendering 5-15 min at 1080p
depending on the effects. A CUDA GPU speeds up separation and alignment if you install a
CUDA build of PyTorch into `pipeline/.venv`.

`pipeline.whisperModel` in project.json can be `small` (faster, fewer anchors), `medium`
(default) or `large-v3` (about three times slower; on our hardest benchmark song it was not more
accurate than `medium`, so it is not the default).
