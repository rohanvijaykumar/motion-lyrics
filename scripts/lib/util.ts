/** Shared helpers for the CLI: logging, paths, processes and JSON files. */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const PROJECTS = path.join(ROOT, "projects");
export const PIPELINE = path.join(ROOT, "pipeline");

const color = (c: number) => (s: string) =>
  process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s;
export const bold = color(1);
export const dim = color(2);
export const red = color(31);
export const green = color(32);
export const yellow = color(33);
export const cyan = color(36);

let stepNo = 0;
export function step(title: string) {
  stepNo++;
  console.log(`\n${cyan(bold(`[${stepNo}]`))} ${bold(title)}`);
}
export const info = (s: string) => console.log(`    ${s}`);
export const ok = (s: string) => console.log(`    ${green("✓")} ${s}`);
export const warn = (s: string) =>
  console.log(`    ${yellow("!")} ${yellow(s)}`);

export class CliError extends Error {}
export function fail(msg: string): never {
  throw new CliError(msg);
}

export function readJson<T = unknown>(file: string): T {
  try {
    return JSON.parse(
      fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
    ) as T;
  } catch (e) {
    fail(`Could not read ${file}: ${(e as Error).message}`);
  }
}

/** Write JSON atomically (temp file + rename) so a crash never leaves a broken file. */
export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export const exists = (p: string) => fs.existsSync(p);
export const mtime = (p: string) =>
  fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0;

/** Run a command, streaming its output, and fail with a clear message if it fails. */
export function run(
  cmd: string,
  args: string[],
  opts: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    quiet?: boolean;
    label?: string;
  } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? ROOT,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        ...opts.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      out += s;
      if (!opts.quiet) process.stdout.write(indent(s));
    });
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      err += s;
      if (!opts.quiet) process.stdout.write(dim(indent(s)));
    });
    child.on("error", (e) =>
      reject(new CliError(`Could not start ${cmd}: ${e.message}`)),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else {
        const tail = (err || out).trim().split(/\r?\n/).slice(-15).join("\n");
        reject(
          new CliError(
            `${opts.label ?? cmd} failed (exit code ${code}).\n${tail}`,
          ),
        );
      }
    });
  });
}

const indent = (s: string) => s.replace(/^(?=.)/gm, "      ");

export function which(cmd: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/)[0]?.trim() || null;
}

/**
 * Where uv is: on PATH, or in its default install folder (a fresh install is
 * not on PATH until a new terminal is opened, so look there too).
 */
export function uvPath(): string | null {
  const onPath = which("uv");
  if (onPath) return onPath;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const exe = process.platform === "win32" ? "uv.exe" : "uv";
  for (const dir of [
    path.join(home, ".local", "bin"),
    path.join(home, ".cargo", "bin"),
  ]) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Install uv with its official installer (used by npm run setup). */
export async function installUv(): Promise<string> {
  if (process.platform === "win32") {
    await run(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "ByPass",
        "-c",
        "irm https://astral.sh/uv/install.ps1 | iex",
      ],
      {
        label: "Installing uv",
      },
    );
  } else {
    await run("sh", ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"], {
      label: "Installing uv",
    });
  }
  const uv = uvPath();
  if (!uv)
    fail(
      "uv was installed but could not be found. Open a new terminal and run: npm run setup",
    );
  return uv;
}

/** Run a pipeline (Python) stage through uv, which manages the Python environment. */
export function py(args: string[], label: string, quiet = false) {
  const uv = uvPath();
  if (!uv)
    fail(
      "The audio tools are not installed yet. Run: npm run setup (it installs everything).",
    );
  return run(
    uv,
    [
      "run",
      "--project",
      PIPELINE,
      "--frozen",
      "python",
      "-m",
      "motion_lyrics",
      ...args,
    ],
    {
      cwd: PIPELINE,
      label,
      quiet,
      env: { PYTHONPATH: PIPELINE },
    },
  );
}

export function slug(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}
