/**
 * Cleanup after a video is approved: remove bulky intermediate files and
 * superseded renders, keep everything a person would want later.
 *
 * Removed: extracted audio, isolated vocals, Whisper caches, render staging,
 *          QC frame images, review stills, drafts and unapproved renders,
 *          Remotion bundles this project created.
 * Kept:    project.json, lyrics.txt, song.json, analysis.json, fonts/, the
 *          review and QC reports (with their strips and failure images),
 *          the contact sheet, the approved videos, and the source video
 *          (unless --media, which removes media/ too).
 */
import fs from "node:fs";
import path from "node:path";
import type { Project } from "../../src/schema/project";
import type { Paths } from "./project";
import { exists, readJson } from "./util";

export type Item = { path: string; bytes: number; why: string };

function size(p: string): number {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((n, f) => n + size(path.join(p, f)), 0);
}

export function cleanupPlan(
  p: Paths,
  project: Project,
  opts: { media: boolean },
): Item[] {
  const items: Item[] = [];
  const add = (file: string, why: string) => {
    if (exists(file)) items.push({ path: file, bytes: size(file), why });
  };
  add(
    path.join(p.work, "audio.wav"),
    "extracted song audio (re-made by npm run make)",
  );
  add(
    path.join(p.work, "vocals.wav"),
    "isolated vocal (re-made by npm run make)",
  );
  add(path.join(p.work, "public"), "render staging folder");
  add(path.join(p.work, "fontcheck.txt"), "QC scratch file");
  if (exists(p.work))
    for (const f of fs.readdirSync(p.work))
      if (/^whisper-.*\.json$|^transcript\.json$/.test(f))
        add(path.join(p.work, f), "speech-recognition cache");
  add(
    path.join(p.review, "stills"),
    "stills already combined into the contact sheet",
  );
  const qcDir = path.join(p.review, "qc");
  if (exists(qcDir))
    for (const fmt of fs.readdirSync(qcDir)) {
      const d = path.join(qcDir, fmt);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d))
        if (
          /-frame\.jpg$|-video\.jpg$|^measure\.json$|^compare.*\.json$|^faces\.json$/.test(
            f,
          )
        )
          add(path.join(d, f), "QC working image/data");
    }
  const approved = new Set(
    project.approved.map((a) => path.resolve(p.dir, a.file)),
  );
  if (exists(p.out))
    for (const f of fs.readdirSync(p.out)) {
      const full = path.resolve(p.out, f);
      if (!approved.has(full))
        add(
          full,
          f.startsWith("draft")
            ? "draft video"
            : "render that was not approved",
        );
    }
  const bundles = path.join(p.work, "bundles.json");
  if (exists(bundles)) {
    for (const b of readJson<string[]>(bundles))
      add(b, "Remotion render bundle (temporary)");
    add(bundles, "bundle list");
  }
  if (opts.media)
    add(
      p.media,
      "copy of the source media (the project can no longer be re-rendered)",
    );
  return items;
}

export function applyCleanup(items: Item[]) {
  for (const it of items) fs.rmSync(it.path, { recursive: true, force: true });
}

export const human = (b: number) =>
  b > 1e9
    ? `${(b / 1e9).toFixed(2)} GB`
    : b > 1e6
      ? `${(b / 1e6).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1e3))} KB`;
