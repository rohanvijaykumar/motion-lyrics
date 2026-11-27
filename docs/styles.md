# Styles

A style is built from independent parts, and every part can be changed in `project.json`.
A **preset** is a named set of choices; your project picks one and overrides any field next to it:

```jsonc
"style": {
  "preset": "golden-sparkle",
  "text": { "primary": { "fontSize": 88, "sungColor": "#ffd27a" } },
  "layout": { "position": "top" },
  "effects": { "sparkles": { "enabled": false } }
}
```

Your editor autocompletes every field from `schema/project.schema.json` (run `npm run schema`
once if the file is missing). `npm run presets` lists the presets (`npm run presets -- --mood calm`
filters them by mood). Sizes are in pixels for a 1080-pixel frame and scale automatically for
4K, vertical or square output.

**See every style on your own video:** `npm run styles -- <project>` renders one still per
preset at a sung moment over your footage and tiles them into `review/styles.jpg`. Narrow it
with `--mood dreamy` or `--only comic-pop,aurora`, and pick the moment with `--time 42.5`.

![Presets](images/presets.jpg)

## Presets

| Preset | Look |
| --- | --- |
| `golden-sparkle` | Warm gold karaoke fill with a spinning star at the wipe head and sparkles shed from each sung word; lines rise out of a soft blur over a dark halo in the lower third. |
| `chalk` | Hand-written chalk lettering with a warm yellow fill over a cool halo, plus film grain. |
| `classic-karaoke` | Two alternating rows; the next line waits in the other row while the current one fills white to blue. Bold outlined type. |
| `social-pop` | Two or three big uppercase words at a time with a yellow box jumping to the sung word. Made for vertical and square video. |
| `kinetic` | Huge centred type; each word lands the moment it is sung, with a beat pulse. |
| `scroll-focus` | The whole lyric sheet scrolls; the sung line is bright and the rest fades back. |
| `minimal-subtitles` | Quiet subtitles on a thin dark band, with a gentle brightening on the sung word. |
| `cinematic` | Serif lettering that blooms in slowly with a glowing fill, a vignette, grain and drifting motes. |
| `neon` | Words switch on with a pink neon glow over a purple haze. |
| `marker-pen` | Dark handwriting on a white paper card; a yellow highlighter sweeps behind each sung word and stays. Readable on any footage. |
| `hand-drawn` | Felt-tip lettering that floats gently; a hand-drawn circle is sketched around each sung word. |
| `comic-pop` | Halftone comic colour on the footage, spinning rays, outlined yellow lettering that pops in and jolts on the beat. |
| `retro-vhs` | Scanlines, colour fringing and tape noise on the picture; terminal type that types itself out. |
| `dreamy-float` | Pastel words that drift, 3D bokeh, a hazy glow on the picture and light leaks at each section. |
| `editorial` | Magazine serif with a clean sans translation, wiped on screen by screen, an ink line drawn under each sung word. |
| `aurora` | Northern-lights ribbons from a GPU shader, stars in 3D depth, a slow push in. |
| `cosmic` | Stars streaming past in 3D, a cool grade, wide uppercase lettering that irises open. |
| `club-beat` | Tall condensed type with motion trails, beat kicks and a mirrored equalizer that moves with the music. |
| `storybook` | Paper texture on the picture, rounded letters, iris transitions and a wavy line under the sung word. |
| `noir-typewriter` | Black-and-white high-contrast picture, typewriter lettering, heavy vignette and grain. |
| `sunset-film` | Warm grade, light leaks on every new screen, a slow push in and glowing serif lettering. |
| `broadcast` | TV graphics: bold sans on a dark panel that slides up, with an accent box on the sung word. |
| `pixel-arcade` | Pixelated picture, 8-bit lettering that types itself out, a jolt on the beat. |
| `winter-snow` | Snow falling in 3D over a cool grade; soft rounded letters glow pale blue. |
| `love-letter` | Flowing script, rose petals drifting in 3D, a hand-drawn pink underline under every sung word. |

Every preset has mood tags (`calm`, `energetic`, `elegant`, `playful`, `bold`, `dreamy`, `retro`,
`cinematic`, `handmade`, `minimal`, `party`, `romantic`, `kids`, `dark`, `warm`, `social`), shown
by `npm run presets`, so a request like "something calm and elegant" maps to two or three
suggestions.

All the parts below combine freely. For example
`{ "preset": "neon", "transition": { "type": "iris" }, "effects": { "depth": { "type": "stars" } } }`
is neon with iris screen changes and a starfield.

## The parts

### `layout`

| Field | Values | Default |
| --- | --- | --- |
| `type` | `stack` (screen of lines), `alternate` (two-row karaoke), `pop` (a few words at a time), `kinetic` (words land as sung), `scroll` (scrolling sheet) | `stack` |
| `position` | `bottom`, `center`, `top` | `bottom` |
| `avoidFaces` | off: lyrics stay in one place for the whole video. On: a screen moves to the other end of the frame when it would cover a detected face | `false` |
| `align` | `center`, `start`, `end` (start = left for left-to-right scripts) | `center` |
| `marginX`, `marginY` | safe margins as fractions of the frame (vertical video always keeps at least 15% at the top and bottom, clear of app buttons) | `0.06`, `0.09` |
| `maxWidth` | fraction of the width a line may use before wrapping | `0.86` |
| `lineGap`, `wordSpacing` | spacing in em | `0.1`, `0.07` |
| `wordsPerPage`, `maxCharsPerPage` | `pop` layout limits | `3`, `22` |
| `scrollVisibleLines`, `inactiveOpacity` | `scroll` layout | `7`, `0.35` |

### `text.primary`, `text.secondary`, `tracks`

`primary` is the main sung language of each screen; `secondary` is a second sung language on
the same screen and all translations. Override a single language with `tracks`:
`"tracks": { "en": { "fontSize": 60 } }`.

Fields: `fontFamily` (any Google Font name, or a `localFonts` family; `null` = the Noto font
for each script), `fontWeight`, `fontSize`, `letterSpacing` (em), `lineHeight`,
`textTransform`, `italic`, `color` (not yet sung), `sungColor`, `shadow`, `sungShadow`
(CSS text-shadow; use it for glows), `strokeWidth`, `strokeColor`.

`fonts` sets a font per script, e.g. `"fonts": { "Deva": "Kalam", "Arab": "Cairo" }`.
`fontFallback` is `sans` or `serif` and picks Noto Sans or Noto Serif for scripts the main font
does not cover.

### `timing`

`lead` (seconds a screen appears before its first word, default 0.55), `tail` (how long it
lingers, 1.1), `holdLast` (keep the last screen until the end), `minEnter`. Screens never
overlap: when lines follow closely, the old screen leaves just as the next is needed.

### `enter` and `exit`

`enter.type`: `fade`, `blur-rise`, `rise`, `slide`, `scale`, `pop`, `mask`, `typewriter`,
`letters`, `none`. `exit.type`: `fade`, `blur-rise`, `drift-up`, `sink`, `slide`, `scale`, `mask`,
`none`. Both take `duration`, `distance`, `blur` and `ease` (`out`, `inOut`, `spring`, `linear`);
`enter` also takes `stagger` (between lines) and `wordStagger` (between words). `typewriter` and
`letters` animate letter by letter only for scripts where that is safe; joined scripts
(Arabic, Devanagari...) animate whole words.

### `transition`

How each screen arrives and leaves, drawn with
[@remotion/transitions](https://www.remotion.dev/docs/transitions) presentations, on top of
`enter` and `exit` (set those to `none` for a pure transition).

| Field | Values | Default |
| --- | --- | --- |
| `type` | `none`, `fade`, `wipe`, `slide`, `flip`, `clock-wipe`, `iris` | `none` |
| `direction` | `from-left`, `from-right`, `from-top`, `from-bottom` (wipe, slide, flip) | `from-left` |
| `duration` | seconds; never longer than the room between screens | `0.45` |
| `exit` | also leave with the transition | `true` |

### `highlight`

| Field | Meaning |
| --- | --- |
| `type` | `wipe` (karaoke fill across the word), `color` (word changes colour when sung), `none` |
| `softEdge` | feathered wipe edge, fraction of the word (0 = crisp) |
| `wipeEase`, `wipeLead`, `minWordDuration` | wipe feel and timing |
| `persist` | sung words stay highlighted |
| `liftY`, `liftScale`, `liftIn`, `liftOut` | the sung word rises and grows slightly |
| `dimUpcoming`, `dimFinished` | opacity of lines waiting to be sung / already sung |
| `underline` | `{ enabled, color, thickness, offset }`, grows with the wipe |
| `box` | `{ enabled, color, textColor, radius, padX, padY }`, a pill behind the sung word |
| `translation` | `line` (translations fill along with their line) or `none` |
| `mark` | a mark drawn on the sung word (below) |

`highlight.mark` draws on the word being sung. Hand-drawn marks come from
[@remotion/rough-notation](https://www.remotion.dev/docs/text-highlights) and are seeded per
word, so every render draws the same strokes. The smooth lines are SVG paths drawn on with
[@remotion/paths](https://www.remotion.dev/docs/paths).

| Field | Meaning | Default |
| --- | --- | --- |
| `type` | `none`, `marker` (highlighter behind the word), `underline`, `circle`, `box`, `strike`, `crossed`, `bracket`, `ink-underline`, `wave-underline` | `none` |
| `color`, `strokeWidth`, `padding` | pen colour, stroke width in px, room around the word | yellow, `4`, `6` |
| `iterations` | pen strokes per hand-drawn mark | `2` |
| `draw` | seconds to draw it (never longer than the word) | `0.35` |
| `persist` | keep marks on words already sung | `false` |

### `effects`

| Effect | Fields |
| --- | --- |
| `scrim` | backing for legibility: `type` `radial`/`linear`/`box`/`none`, `color`, `width`, `height` |
| `glint` | star flare riding the wipe head: `enabled`, `size`, `color`, `core`, `halo`, `haloOuter`, `spin` |
| `sparkles` | stars and dust shed by sung words: `enabled`, `perWord`, `perChar`, `size`, `dustRatio`, `colors`, `core`, `glow`, `glowOuter`, `rise`, `life` |
| `particles` | drifting motes over the whole frame: `enabled`, `count`, `color`, `size`, `speed` |
| `grain` | film grain: `enabled`, `opacity` |
| `vignette` | darkened edges: `enabled`, `strength` |
| `beatPulse` | screens pulse on each detected beat: `enabled`, `amount` |
| `look` | a GPU look on the background picture ([@remotion/effects](https://www.remotion.dev/docs/effects)): `type` `noir`, `duotone`, `halftone`, `comic`, `vhs`, `dreamy`, `warm`, `cool`, `faded`, `paper`, `pixel`, `dot-grid`, `thermal`; `amount` (0-1); `colors` (duotone dark and light) |
| `camera` | a slow camera move on the picture: `type` `push-in`, `pull-out`, `pan`, `breathe`, `handheld`; `amount` |
| `drift` | each word floats on its own smooth noise path ([@remotion/noise](https://www.remotion.dev/docs/noise)): `enabled`, `amount` (px), `rotate` (degrees), `speed` |
| `shake` | handheld wobble of the lyric layer: `enabled`, `amount`, `speed`, `onBeat` (a short jolt on each beat instead) |
| `motionBlur` | [@remotion/motion-blur](https://www.remotion.dev/docs/motion-blur): `type` `trail` (echoes behind moving words) or `camera` (true motion blur, slower to render); `samples`, `shutter`, `lag` |
| `lightLeaks` | film light leaks: `enabled`, `on` (`start`, `sections`, `screens`), `duration`, `hueShift`, `opacity` |
| `starburst` | comic-book rays blended over the picture: `enabled`, `colors`, `rays`, `spin`, `opacity` |
| `depth` | a 3D layer ([@remotion/three](https://www.remotion.dev/docs/three)): `type` `bokeh`, `stars`, `snow`, `petals`, `orbs`; `count`, `colors`, `speed`, `opacity` |
| `shader` | a GPU shader over the picture ([@remotion/skia](https://www.remotion.dev/docs/skia)): `type` `aurora`, `plasma`, `rays`; `colors` (three), `opacity`, `speed` |
| `visualizer` | shapes that move with the song ([@remotion/media-utils](https://www.remotion.dev/docs/audio-visualization)): `type` `bars`, `wave`, `mirror`; `position` (`auto` = the edge away from the lyrics), `color`, `height`, `bars` |

Layers from back to front: the picture (with `look` and `camera`), starburst, shader, light
leaks, 3D depth, vignette, particles, visualizer, lyrics (with `drift`, `shake`, marks and
motion blur), graphics, grain. Looks change only the picture, so the lyrics stay sharp and QC
still measures contrast on the real frame.

`look`, `lightLeaks`, `starburst`, `depth` and `shader` use WebGL. Renders switch Chrome to its
GPU backend (ANGLE) for those automatically. If a machine has trouble with it, set the
environment variable `MOTION_LYRICS_GL=swangle` (software rendering: always works, slower).

All motion is a pure function of time and all randomness is seeded, so every render of a
project is identical.

## Background

```jsonc
"background": { "type": "video", "dim": 0.2 }          // the source video, darkened 20%
"background": { "type": "image", "src": "media/cover.jpg" }
"background": { "type": "gradient", "colors": ["#1b1033", "#0e2a47"] }
"background": { "type": "color", "color": "#101014" }
```

## Make your own preset

For one video or a house look, put a JSON preset in `presets/` (see
[presets/README.md](../presets/README.md)). To add a built-in preset for everyone, add an entry
to `src/style/presets.ts` or `src/style/presets-extended.ts` listing only what differs from the
defaults in `src/schema/style.ts`, with a `description` and mood `tags`, add a row to the table
above, and run `npm test`.
