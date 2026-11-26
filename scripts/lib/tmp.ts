/**
 * Private temporary folder for every motion-lyrics command.
 *
 * Remotion, the headless browser and the Python tools write large temporary
 * files (render bundles are ~140 MB each, extracted video frames far more) to
 * the system temp folder, and do not always clean up. Every command therefore
 * points TMP/TEMP/TMPDIR at .cache/tmp/run-<pid> inside this repository and
 * deletes that folder when the command ends, including on errors and Ctrl+C.
 * Folders left by a crashed run are removed the next time any command starts.
 * Nothing outside this repository is touched.
 *
 * Imported first by scripts/cli.ts so it takes effect before Remotion loads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const TMP_ROOT = path.join(ROOT, ".cache", "tmp");
export const RUN_TMP = path.join(TMP_ROOT, `run-${process.pid}`);
/** The system temp folder as it was before this module redirected it. */
export const SYSTEM_TMP =
  process.env.TEMP ?? process.env.TMP ?? process.env.TMPDIR ?? "";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Temp folders from earlier runs whose process has ended. */
export function staleRuns(): string[] {
  if (!fs.existsSync(TMP_ROOT)) return [];
  return fs
    .readdirSync(TMP_ROOT)
    .map((name) => ({ name, pid: Number(/^run-(\d+)$/.exec(name)?.[1]) }))
    .filter((r) => r.pid && r.pid !== process.pid && !alive(r.pid))
    .map((r) => path.join(TMP_ROOT, r.name));
}

const remove = (dir: string) => {
  try {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    });
  } catch {
    /* a file may still be locked; the next run removes it */
  }
};

for (const dir of staleRuns()) remove(dir);
fs.mkdirSync(RUN_TMP, { recursive: true });
process.env.TMP = RUN_TMP;
process.env.TEMP = RUN_TMP;
process.env.TMPDIR = RUN_TMP;

let cleaned = false;
export function cleanupRunTmp() {
  if (cleaned) return;
  cleaned = true;
  remove(RUN_TMP);
}
process.on("exit", cleanupRunTmp);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    cleanupRunTmp();
    process.exit(130);
  });
}
