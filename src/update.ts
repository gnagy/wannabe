import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./project.ts";
import { ExitError } from "./self.ts";

interface Git {
  code: number;
  out: string;
  err: string;
}

function git(home: string, ...args: string[]): Git {
  const result = Bun.spawnSync(["git", "-C", home, ...args], { stdout: "pipe", stderr: "pipe", env: process.env });
  return { code: result.exitCode, out: result.stdout.toString().trim(), err: result.stderr.toString().trim() };
}

/** Runs a command in the checkout with its output on stderr; fails the update on a non-zero exit. */
async function step(home: string, command: string[]): Promise<void> {
  console.error(`── ${command.join(" ")}`);
  const child = Bun.spawn(command, { cwd: home, stdio: ["inherit", 2, 2], env: process.env });
  const code = await child.exited;
  if (code !== 0) throw new ExitError(`self updated: ${command.join(" ")} failed (exit ${code})`, 1);
}

/**
 * self updated [--check]: fast-forwards this checkout to its upstream, then runs what the change needs —
 * `bun install` when the dependencies changed, and the repository's own `scripts/post-update <old> <new>`.
 * With --check, or as wannatry, only says whether there is an update.
 */
export async function updated(env: Env, args: string[]): Promise<string[]> {
  const check = args.includes("--check") || process.env.WANNABE_DRY_RUN === "1";
  for (const arg of args) if (arg !== "--check") throw new ExitError(`${env.name} self updated: unknown argument: ${arg}`, 2);

  const home = env.home;
  if (!existsSync(join(home, ".git"))) throw new ExitError(`self updated: ${home} is not a git checkout`, 1);
  const upstream = git(home, "rev-parse", "--abbrev-ref", "@{u}");
  if (upstream.code !== 0) throw new ExitError(`self updated: ${home} has no upstream to update from`, 1);

  if (git(home, "fetch", "--quiet").code !== 0) throw new ExitError(`self updated: cannot fetch ${upstream.out}`, 1);
  const incoming = git(home, "log", "--oneline", "HEAD..@{u}").out;
  const local = git(home, "log", "--oneline", "@{u}..HEAD").out;
  if (!incoming) return [`Up to date with ${upstream.out}${local ? `, with local commits not pushed` : ""}.`];
  if (local) {
    throw new ExitError(
      `self updated: ${home} has local commits and ${upstream.out} has new ones; rebase or merge them by hand:\n` +
        `local:\n${local}\nincoming:\n${incoming}`,
      1,
    );
  }
  if (check) return [`Update available from ${upstream.out}:`, incoming];

  const dirty = git(home, "status", "--porcelain", "--untracked-files=no").out;
  if (dirty) throw new ExitError(`self updated: ${home} has local changes; commit or stash them first:\n${dirty}`, 1);

  const before = git(home, "rev-parse", "HEAD").out;
  const pulled = git(home, "merge", "--ff-only", "--quiet", "@{u}");
  if (pulled.code !== 0) throw new ExitError(`self updated: fast-forward failed: ${pulled.err}`, 1);
  const after = git(home, "rev-parse", "HEAD").out;

  const changed = git(home, "diff", "--name-only", before, after).out.split("\n");
  if (changed.some((path) => path === "package.json" || path === "bun.lock")) await step(home, ["bun", "install"]);
  const hook = join(home, "scripts", "post-update");
  if (existsSync(hook)) await step(home, [hook, before, after]);

  return [`Updated from ${before.slice(0, 7)} to ${after.slice(0, 7)}:`, incoming];
}
