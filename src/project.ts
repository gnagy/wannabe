import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/** Names no plugin can take: the built-ins. */
export const RESERVED = new Set(["helped", "self"]);

/** Where this run of wannabe stands: its checkout, and the project it found, if any. */
export interface Env {
  /** The name wannabe was called by: wannabe, wannado or wannatry. */
  name: string;
  /** wannabe's own checkout. */
  home: string;
  /** The project root: the nearest directory upwards holding .wannabe/. */
  project?: string;
  /** The project's .wannabe/. */
  wannabeDir?: string;
  /** Plugin directories, searched in order: the project's first, then wannabe's own. */
  roots: string[];
}

/** The nearest directory upwards from start holding .wannabe/, or undefined. */
export function findProject(start: string): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".wannabe")) && statSync(join(dir, ".wannabe")).isDirectory()) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** A plugin calling wannabe again keeps the project already found, wherever it stands. */
export function makeEnv(name: string, home: string, cwd = process.cwd()): Env {
  const project = process.env.WANNABE_PROJECT_DIR || findProject(cwd);
  const roots: string[] = [];
  let wannabeDir: string | undefined;
  if (project) {
    wannabeDir = join(project, ".wannabe");
    if (isDirectory(join(wannabeDir, "plugins"))) roots.push(join(wannabeDir, "plugins"));
  }
  roots.push(join(home, "plugins"));
  return { name, home, project, wannabeDir, roots };
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isReserved(rel: string): boolean {
  return RESERVED.has(rel.split("/")[0]);
}

/** The first root holding a relative path, as a full path. */
export function locate(env: Env, rel: string): string | undefined {
  if (isReserved(rel)) return undefined;
  for (const root of env.roots) {
    const path = join(root, rel);
    if (existsSync(path)) return path;
  }
  return undefined;
}

/** The commands and groups under a relative path, across all roots; the first root wins a name. */
export function children(env: Env, rel: string): string[] {
  const names = new Set<string>();
  for (const root of env.roots) {
    const dir = join(root, rel);
    if (!isDirectory(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) continue;
      if (rel === "" && RESERVED.has(entry)) continue;
      const path = join(dir, entry);
      if (isDirectory(path) || isExecutableFile(path)) names.add(entry);
    }
  }
  return [...names].sort();
}

/** Follows words down the groups: the group reached, and how many words it took. */
export function descend(env: Env, words: string[]): { rel: string; consumed: number } {
  let rel = "";
  let consumed = 0;
  for (const word of words) {
    const next = rel ? `${rel}/${word}` : word;
    const found = locate(env, next);
    if (!found || !isDirectory(found)) break;
    rel = next;
    consumed++;
  }
  return { rel, consumed };
}

/** The comment lines at the top of a plugin, below the shebang, without their comment markers. */
export function pluginHeader(path: string): string[] {
  const lines = readFileSync(path, "utf8").split("\n");
  const header: string[] = [];
  for (const line of lines.slice(lines[0]?.startsWith("#!") ? 1 : 0)) {
    const match = line.match(/^(?:#|\/\/)\s?(.*)$/);
    if (!match) break;
    header.push(match[1]);
  }
  return header;
}

/** A plugin's usage line, the one starting "wannabe:", or "(group)" for a directory. */
export function describe(path: string): string {
  if (isDirectory(path)) return "(group)";
  const usage = pluginHeader(path).find((line) => line.startsWith("wannabe:"));
  return usage ? usage.replace(/^wannabe:\s*/, "") : "";
}

/** Contexts: the directories in .wannabe other than plugins. */
export function contexts(env: Env): string[] {
  if (!env.wannabeDir) return [];
  return readdirSync(env.wannabeDir)
    .filter((entry) => entry !== "plugins" && !entry.startsWith(".") && isDirectory(join(env.wannabeDir!, entry)))
    .sort();
}
