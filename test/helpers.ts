import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const BIN = join(import.meta.dir, "..", "bin");

/** A scratch directory, with files written into it from a map of relative path to content. */
export function scratch(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "wannabe-test-"));
  write(root, files);
  return root;
}

export function write(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    if (content.startsWith("#!")) chmodSync(full, 0o755);
  }
}

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs one of the three commands from a directory, with a clean wannabe environment. */
export function wannabe(cwd: string, args: string[], name = "wannabe"): Run {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("WANNABE_")) delete env[key];
  const result = Bun.spawnSync([join(BIN, name), ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

/** Runs git, failing the test on an error. */
export function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.toString().trim();
}

export const plugin = (usage: string, body: string) => `#!/bin/sh\n# wannabe: ${usage}\n#\n# Details.\n${body}\n`;
