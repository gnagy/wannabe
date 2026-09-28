import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, scratch, write } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..");

/** A checkout of wannabe with an upstream of its own, and a second clone to push new commits from. */
function setup(): { checkout: string; upstream: string } {
  const root = scratch();
  const seed = join(root, "seed");
  for (const dir of ["bin", "src", "lib", "plugins", "scripts"]) cpSync(join(ROOT, dir), join(seed, dir), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(seed, "package.json"));
  git(seed, "init", "-q", "-b", "master");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(root, "clone", "-q", "--bare", seed, "origin.git");
  git(root, "clone", "-q", join(root, "origin.git"), "checkout");
  git(root, "clone", "-q", join(root, "origin.git"), "upstream");
  return { checkout: join(root, "checkout"), upstream: join(root, "upstream") };
}

function self(checkout: string, ...args: string[]) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("WANNABE_")) delete env[key];
  const result = Bun.spawnSync([join(checkout, "bin", "wannabe"), "self", "updated", ...args], {
    cwd: checkout,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: result.exitCode, stderr: result.stderr.toString() };
}

function pushChange(upstream: string, files: Record<string, string>, message: string): void {
  write(upstream, files);
  git(upstream, "add", ".");
  git(upstream, "commit", "-q", "-m", message);
  git(upstream, "push", "-q");
}

describe("self updated", () => {
  test("up to date: nothing to do", () => {
    const { checkout } = setup();
    const run = self(checkout);
    expect(run.code).toBe(0);
    expect(run.stderr).toContain("Up to date");
  });

  test("--check reports an update without applying it", () => {
    const { checkout, upstream } = setup();
    pushChange(upstream, { "NEWS.md": "news\n" }, "add news");
    const run = self(checkout, "--check");
    expect(run.stderr).toContain("Update available");
    expect(run.stderr).toContain("add news");
    expect(existsSync(join(checkout, "NEWS.md"))).toBe(false);
  });

  test("fast-forwards, and runs the repository's post-update hook with both commits", () => {
    const { checkout, upstream } = setup();
    const before = git(checkout, "rev-parse", "HEAD");
    pushChange(
      upstream,
      { "scripts/post-update": `#!/bin/sh\necho "$1 $2" > "$(dirname "$0")/../post-update.ran"\n` },
      "add a post-update hook",
    );
    const run = self(checkout);
    expect(run.code).toBe(0);
    const after = git(checkout, "rev-parse", "HEAD");
    expect(after).not.toBe(before);
    expect(run.stderr).toContain("add a post-update hook");
    expect(readFileSync(join(checkout, "post-update.ran"), "utf8").trim()).toBe(`${before} ${after}`);
  });

  test("refuses local changes, and keeps them", () => {
    const { checkout, upstream } = setup();
    pushChange(upstream, { "NEWS.md": "news\n" }, "add news");
    writeFileSync(join(checkout, "package.json"), "{}\n");
    const run = self(checkout);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("local changes");
    expect(readFileSync(join(checkout, "package.json"), "utf8")).toBe("{}\n");
  });

  test("refuses to merge when the checkout has diverged", () => {
    const { checkout, upstream } = setup();
    pushChange(upstream, { "NEWS.md": "news\n" }, "theirs");
    write(checkout, { "MINE.md": "mine\n" });
    git(checkout, "add", ".");
    git(checkout, "commit", "-q", "-m", "mine");
    const run = self(checkout);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("rebase or merge them by hand");
    expect(git(checkout, "log", "-1", "--format=%s")).toBe("mine");
  });
});
