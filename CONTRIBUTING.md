# Contributing

Thanks for helping. A few rules keep the framework dependable for everyone:

1. **Every animation is a pure function of time.** Read time from the render context (`t`), use
   seeded randomness (`src/core/random.ts`) and never CSS transitions, `Date.now()` or
   `Math.random()`. That is what makes renders repeatable across machines and parallel workers.
2. **Nothing assumes English.** New text features must work for right-to-left scripts and for
   scripts without spaces, and must not split joined scripts into letters
   (`LETTER_SAFE_SCRIPTS` in `src/core/script.ts`). Add a test with a non-Latin example.
3. **Measure alignment changes.** Run `npm run bench` before and after any change in
   `pipeline/` and put both results in the pull request. Changes that lower accuracy or the
   share of bad words caught by review flags will not be merged.
4. **No personal media or lyrics in the repo.** Projects live in `projects/` (git-ignored).
   Examples and tests use original placeholder text.
5. Before opening a pull request:

   ```bash
   npx tsc --noEmit
   npm test
   cd pipeline && uv run python -m pytest -q tests
   ```

New presets are welcome: add them to `src/style/presets.ts`, add a row to `docs/styles.md`, and
regenerate the gallery with `npx tsx scripts/docs-images.ts presets`.
