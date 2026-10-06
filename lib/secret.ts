/**
 * Secrets for plugins: named in .wannabe/secrets.yaml, never held in it. A secret is looked up, in this order, in
 *   1. the environment variable WANNABE_SECRET_<NAME> (name upper-cased, anything but letters and digits as _): CI
 *   2. the command the secret declares, whose output is the value
 *   3. the operating system's store (Keychain, libsecret, Credential Manager), through Bun.secrets
 *
 * WANNABE_SECRET_STORE=<directory> swaps the operating system's store for plain files, for tests.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readValue } from "../src/config.ts";
import { die, projectDir, wannabeDir } from "./plugin.ts";

export type Source = "environment" | "command" | "store";

export interface Declared {
  name: string;
  description: string;
  command: string[] | undefined;
}

export const envName = (name: string) => `WANNABE_SECRET_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;

/** One project's secrets live under one service name, so two projects can use the same secret name. */
const service = () => `wannabe:${basename(projectDir)}`;

/** The secrets .wannabe/secrets.yaml declares. */
export async function declared(): Promise<Declared[]> {
  const spec = await readValue(wannabeDir, "secrets", "spec");
  if (spec === null || typeof spec !== "object") return [];
  return Object.entries(spec as Record<string, Record<string, unknown> | null>).map(([name, entry]) => ({
    name,
    description: String(entry?.description ?? ""),
    command: entry?.command === undefined ? undefined : [entry.command].flat().map(String),
  }));
}

/** Where a secret is declared, or undefined when it is not. */
export async function declaration(name: string): Promise<Declared | undefined> {
  return (await declared()).find((secret) => secret.name === name);
}

function fileStore(directory: string, name: string): string {
  return join(directory, `${service().replace(/[^A-Za-z0-9._-]/g, "_")}.${name}`);
}

async function storeGet(name: string): Promise<string | null> {
  const directory = process.env.WANNABE_SECRET_STORE;
  if (directory) {
    try {
      return readFileSync(fileStore(directory, name), "utf8");
    } catch {
      return null;
    }
  }
  return Bun.secrets.get({ service: service(), name });
}

export async function storeSet(name: string, value: string): Promise<void> {
  const directory = process.env.WANNABE_SECRET_STORE;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(fileStore(directory, name), value, { mode: 0o600 });
    return;
  }
  await Bun.secrets.set({ service: service(), name, value });
}

/** Whether something was deleted. */
export async function storeDelete(name: string): Promise<boolean> {
  const directory = process.env.WANNABE_SECRET_STORE;
  if (directory) {
    rmSync(fileStore(directory, name), { force: true });
    return true;
  }
  return Bun.secrets.delete({ service: service(), name });
}

export interface Found {
  value: string;
  source: Source;
}

export interface Problem {
  /** What went wrong with the one source that was tried and failed, if any. */
  reason: string;
}

/**
 * Looks a secret up. Returns what was found and where; or, when nothing was, why not: a declared command that
 * failed or an operating system store that could not be reached, which is not the same as "nothing stored".
 */
export async function find(name: string): Promise<Found | Problem> {
  const fromEnvironment = process.env[envName(name)];
  if (fromEnvironment) return { value: fromEnvironment, source: "environment" };

  const command = (await declaration(name))?.command;
  if (command) {
    const result = Bun.spawnSync(command, { cwd: projectDir || process.cwd(), stdout: "pipe", stderr: "pipe", env: process.env });
    const value = result.stdout.toString().trim();
    if (result.exitCode !== 0) return { reason: `its command failed (exit ${result.exitCode}): ${command.join(" ")}` };
    if (!value) return { reason: `its command printed nothing: ${command.join(" ")}` };
    return { value, source: "command" };
  }

  try {
    const value = await storeGet(name);
    if (value) return { value, source: "store" };
    return { reason: "" };
  } catch (error) {
    return { reason: `the operating system's secret store could not be read: ${(error as Error).message}` };
  }
}

/** Why a secret was not found, and what to do about it. */
export async function missing(name: string, problem: Problem): Promise<string> {
  const declaredAs = await declaration(name);
  const parts = [`no secret '${name}'${problem.reason ? `: ${problem.reason}` : ""}`];
  if (declaredAs?.description) parts.push(declaredAs.description);
  parts.push(`store it with: wannabe secret stored ${name}   (in CI, set ${envName(name)})`);
  return parts.join("\n  ");
}

/** A secret's value for a plugin; exits 1, saying how to store it, when there is none. */
export async function getSecret(name: string): Promise<string> {
  const found = await find(name);
  if ("value" in found) return found.value;
  return die(1, await missing(name, found));
}
