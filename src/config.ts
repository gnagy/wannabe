import { join } from "node:path";

/** A value from .wannabe/<file>.yaml, following a dotted path; undefined when the file or the value is missing. */
export async function readValue(wannabeDir: string, file: string, path: string): Promise<unknown> {
  const source = Bun.file(join(wannabeDir, `${file}.yaml`));
  if (!(await source.exists())) return undefined;
  const document = Bun.YAML.parse(await source.text());
  let node: unknown = document;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node ?? undefined;
}

/** How a value prints: a list one item per line, a mapping as JSON, anything else as text. */
export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
