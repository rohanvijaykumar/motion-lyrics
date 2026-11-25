# lyrics.txt format

A plain UTF-8 text file. Anyone can write it in any editor.

```text
@title: Song title
@artist: Who sings it
@lang: hi, en

# Lines starting with "#" are comments.

[Verse 1]
हर आवाज़ में रोशनी है
Light in every voice

Every step is new
> Cada paso es nuevo
```

## Lines

| Line | Meaning |
| --- | --- |
| `@title: ...` `@artist: ...` | Song details (used by title graphics, saved in song.json) |
| `@lang: hi, en` | Every language in the song, the most common first. Use language codes (BCP-47): `en`, `hi`, `es`, `ar`, `ja`, `zh`, `zh-Hant`, `ta`, `pt-BR`... |
| `# ...` | Comment, ignored |
| `[Chorus]` | Name for the next screen (shown only if `sectionLabels` is on in project.json) |
| any other text | A **sung** line |
| `> text` | A **translation** (or romanization) shown under the sung line above it and highlighted along with it. It is not aligned to the audio. |
| `{es} text` or `> {es} text` | Explicit language for this line |
| blank line | Start a new **screen** (a group of lines shown together) |
| `[01:23.45]` at the start of a line | An LRC timestamp; ignored, so synced lyrics can be pasted as they are |

## Rules

1. **Write lines in the order they are sung, including every repeat.** The aligner needs every
   sung word, in order. Do not write "Chorus x2"; write the chorus out twice.
2. **Spell words the way they are sung.** If the singer says "gonna", write "gonna".
3. **Languages that share a script need tags.** An untagged line's language comes from its
   script (Devanagari is Hindi when `hi` is in `@lang`). English and Spanish are both Latin, so
   with `@lang: en, es` untagged Latin lines count as English and Spanish lines need `{es}`.
   The CLI warns when this applies.
4. **Screens:** two to four short lines per screen reads best. Long lines wrap automatically.
5. Ad-libs or backing vocals you do not want on screen can be left out; the aligner treats
   vocals that are not written as gaps. Leaving out many sung words lowers accuracy around them.

## Which screen layout uses what

- `stack` (most presets): each screen is shown as a block; its lines light up in turn.
- `alternate` (classic-karaoke): every sung line gets its own row; screens only group translations.
- `pop` (social-pop): words are shown a few at a time; screens and translations are ignored.
- `kinetic`: one sung line at a time with its translations.
- `scroll` (scroll-focus): the whole lyric sheet; screens only affect spacing.

## No lyrics?

Run `make` without `--lyrics`. The pipeline drafts `lyrics.txt` with speech recognition and
carries on, but **the draft will contain mistakes**: songs are hard for speech recognition.
Correct `projects/<name>/lyrics.txt` and run `npm run make -- <name>` again.
