# Languages and scripts

motion-lyrics is built so that nothing assumes English, Latin letters or left-to-right text.

## What happens for each language

| Step | How it handles any language |
| --- | --- |
| Word splitting | `Intl.Segmenter` (built into Node and Chrome) finds word boundaries, including for Chinese, Japanese, Thai, Khmer, Lao and Burmese, which are written without spaces. Punctuation stays attached to its word. |
| Alignment | Every word is romanized with [uroman](https://github.com/isi-nlp/uroman) and aligned with Meta's MMS forced-alignment model, trained on 1,100+ languages. |
| Anchors / second opinion | Whisper transcribes the vocal in each language of the song (99 languages). Its words are compared with the lyrics in romanized form. |
| Fonts | Each line gets a font stack: the style's font, then the Noto font made for that script (Noto Sans Devanagari, Noto Sans Arabic, Noto Sans JP, ...). Only the font slices containing characters actually used are downloaded. |
| Direction | Arabic, Hebrew, Syriac, Thaana and N'Ko lines are laid out right-to-left and the karaoke wipe runs right-to-left. |
| Joining scripts | Effects that split words into letters (`typewriter`, `letters`) are only used for scripts where that is safe. Arabic, Indic and other joining or stacking scripts animate whole words so shaping is never broken. |

## What has been tested

- **Rendering** with every preset: Latin, Cyrillic, Devanagari, Bengali, Tamil, Arabic, Hebrew,
  Thai, Chinese, Japanese and Korean (`npx tsx scripts/test-scripts.ts` renders a contact sheet
  you can check yourself; the demo covers Arabic, Hindi and Japanese).
- **Word splitting and script detection** (unit tests): the above plus Khmer and Traditional Chinese.
- **Alignment accuracy** against hand timings: English, French, German and Spanish
  (`npm run bench`), and a real bilingual Hindi/English song.

Other languages go through exactly the same code paths. If you are the first to use one,
check its review report and contact sheet carefully, and consider adding it to
`scripts/test-scripts.ts`.

## Languages sharing a script

Tag lines when two languages of a song use the same script (see `lyrics-format.md`):

```text
@lang: en, es
Every step is new
{es} Cada paso es nuevo
```

## Chinese and Japanese per-character karaoke

Words are the default unit. For the per-character highlight common in Chinese and Japanese
karaoke, set the tokenizer for that language in project.json:

```json
"tokenize": { "zh": "char", "ja": "char" }
```

## Accuracy by language

Alignment is strongest where both MMS and Whisper are strong (most European languages, Hindi,
Arabic, Chinese, Japanese...). For languages Whisper knows poorly, fewer words are anchored, so
more lines are marked **Glance** in the review report. The timing is still usually right;
it is just less verified, so watch the draft.

Romanization note: uroman reads Japanese kanji with Chinese readings, which makes kanji-heavy
Japanese lines a little less precise. Writing furigana-free kana lines in `lyrics.txt` is not
required; it simply helps if a passage is flagged.
