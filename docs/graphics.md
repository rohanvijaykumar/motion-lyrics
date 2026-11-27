# Graphics

Besides lyrics, a project can show titles, text, lower thirds, logos, Lottie animations and
credits. List them in `project.json` under `"graphics"`. Times are in seconds. Positions
(`at`) are fractions of the frame: `{ "x": 0.5, "y": 0.5 }` is the centre. Every graphic takes
`enter` (`fade`, `rise`, `scale`, `pop`, `none`), `exit` (`fade`, `sink`, `scale`, `none`) and
`transition` (seconds).

```jsonc
"graphics": [
  { "type": "title", "title": "Song title", "subtitle": "Artist name", "start": 0, "end": 3.5 },
  { "type": "lowerThird", "title": "Sung by the choir", "subtitle": "Recorded live", "start": 6, "end": 11 },
  { "type": "text", "text": "Learn more at example.org", "start": 70, "end": 74, "at": { "x": 0.5, "y": 0.9 }, "size": 40 },
  { "type": "image", "src": "media/logo.png", "start": 0, "end": 74, "width": 0.1, "at": { "x": 0.93, "y": 0.08 }, "opacity": 0.85 },
  { "type": "lottie", "src": "media/confetti.json", "start": 60, "end": 64, "width": 0.5 },
  { "type": "credits", "lines": ["Thank you", "Music by ...", "Video by ..."], "start": 66, "end": 74 }
]
```

| Type | Fields |
| --- | --- |
| `title` | `title`, `subtitle`, `at`, `size`, `color`, `accent`, `fontFamily`, `scrim` |
| `text` | `text` (use `\n` for new lines), `at`, `size`, `weight`, `color`, `fontFamily`, `background` |
| `lowerThird` | `title`, `subtitle`, `side` (`left`/`right`), `position` (`auto` keeps it clear of the lyrics: top when lyrics are at the bottom), `color`, `accent`, `fontFamily` |
| `image` | `src` (inside the project folder), `at`, `width` (fraction of frame width), `opacity` |
| `lottie` | `src` (Lottie JSON inside the project folder), `at`, `width`, `loop` |
| `credits` | `lines` (first line is larger), `size`, `color`, `fontFamily` |
| `gif` | `src` (GIF, APNG, animated WebP or AVIF), `at`, `width`, `fit` (`contain`/`cover`/`fill`), `loop`; plays in step with the video ([@remotion/gif](https://www.remotion.dev/docs/gif)) |
| `rive` | `src` (a `.riv` file), `at`, `width`, `aspect` (height / width), `artboard`, `animation` ([@remotion/rive](https://www.remotion.dev/docs/rive)) |
| `emoji` | `emoji` (a name such as `fire`, `red-heart`, `sparkles`, `party-popper`, `rocket`, `clap`, `musical-notes`), `at`, `size`; Google's animated Noto emoji, by the names [@remotion/animated-emoji](https://www.remotion.dev/docs/animated-emoji) lists. Needs internet when rendering |
| `sound` | `sound` (a built-in effect: `whoosh`, `whip`, `page-turn`, `switch`, `mouse-click`, `shutter`, `shutter-old`, `ding`, `record-scratch`, `vine-boom`, `yippee` and more from [@remotion/sfx](https://www.remotion.dev/docs/sfx), or a file such as `media/clap.wav`), `volume`. Plays at `start`. Built-in sounds need internet when rendering |
| `lightLeak` | a film light leak washing over the frame from `start` to `end`: `seed` (pattern), `hueShift` (0 warm, 120 green, 240 blue), `opacity` |
| `starburst` | comic-book rays behind everything: `colors`, `rays`, `spin`, `opacity` |

```jsonc
// A whoosh and a light leak as the title appears, a heart that pops in at the chorus
{ "type": "sound", "sound": "whoosh", "start": 0.2, "end": 1.5 },
{ "type": "lightLeak", "start": 0, "end": 1.8, "hueShift": 20 },
{ "type": "emoji", "emoji": "red-heart", "start": 32, "end": 36, "at": { "x": 0.85, "y": 0.2 }, "enter": "pop" }
```

Put image, GIF, Rive, Lottie and sound files in the project's `media/` folder. Text in any
script works; fonts are picked per script the same way as for lyrics.

**Section labels:** set `"sectionLabels": true` to show `[Chorus]`-style names from
`lyrics.txt` briefly at the top of the frame as each section starts.
