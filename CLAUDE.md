# CLAUDE.md

Read and follow **AGENTS.md** - it is the step-by-step process for making a lyric video with
this repo, with a gate after every stage. The `/motion-lyrics` skill in `.claude/skills/`
loads the same process.

Remotion knowledge: if the Remotion agent skills are installed (`npx remotion skills add`),
use them for any change under `src/`.

Quick map:

- `scripts/cli.ts` - every `npm run` command
- `pipeline/motion_lyrics/` - Python audio pipeline (separate, listen, align, refine, verify)
- `src/` - Remotion composition: `core/` (pure logic), `render/` (components), `style/` (presets)
- `projects/` - people's videos (git-ignored). `examples/demo/` - the demo project.
- Tests: `npm test` (TypeScript), alignment accuracy: `npm run bench`.
