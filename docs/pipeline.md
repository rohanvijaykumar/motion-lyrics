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
   └─ render     Remotion: React components draw every frame; ffmpeg encodes
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
| `out/` | render | videos |

`make` skips stages whose outputs are newer than their inputs; `--force` redoes everything.

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
| Badly timed words (> 0.5 s off) that are in a flagged line | 99% |
| Unflagged words within 0.3 s | 99.5% |
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
