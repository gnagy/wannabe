/**
 * Compose files, read as YAML and edited as text: a change touches one line and keeps everything else — comments,
 * quoting, indentation, the order of keys — as the file's author left it.
 */

/** The image of a service, or undefined when the file has no such service or it has no image. */
export function serviceImage(text: string, service: string): string | undefined {
  const document = Bun.YAML.parse(text) as { services?: Record<string, { image?: unknown }> } | null;
  const image = document?.services?.[service]?.image;
  return image === undefined || image === null ? undefined : String(image);
}

export interface PinResult {
  text: string;
  changed: { before: string; after: string }[];
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const isContent = (line: string) => line.trim() !== "" && !line.trimStart().startsWith("#");
const keyPattern = (key: string) =>
  new RegExp(`^\\s*(?:${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|"${key}"|'${key}'):\\s*(#.*)?$`);

/**
 * Sets the image of one service: the image: key directly under services.<service>. Other services, even with
 * the same image, are left alone. Returns the text unchanged, with nothing listed, when it already has that image.
 */
export function pinImage(text: string, service: string, image: string): PinResult {
  const lines = text.split("\n");
  const changed: PinResult["changed"] = [];

  const servicesAt = lines.findIndex((line) => indentOf(line) === 0 && keyPattern("services").test(line));
  if (servicesAt < 0) return { text, changed };

  // services.<service>: the first child of services with that key.
  let serviceAt = -1;
  let childIndent = -1;
  for (let i = servicesAt + 1; i < lines.length; i++) {
    if (!isContent(lines[i])) continue;
    const indent = indentOf(lines[i]);
    if (indent === 0) break;
    if (childIndent < 0) childIndent = indent;
    if (indent === childIndent && keyPattern(service).test(lines[i])) {
      serviceAt = i;
      break;
    }
  }
  if (serviceAt < 0) return { text, changed };

  // Its own keys: the lines indented under it, up to the next line that is not.
  let keyIndent = -1;
  for (let i = serviceAt + 1; i < lines.length; i++) {
    if (!isContent(lines[i])) continue;
    const indent = indentOf(lines[i]);
    if (indent <= childIndent) break;
    if (keyIndent < 0) keyIndent = indent;
    if (indent !== keyIndent) continue;
    const match = lines[i].match(/^(\s*image:\s*)(["']?)([^"'\s#]+)\2(\s*(?:#.*)?)$/);
    if (!match) continue;
    if (match[3] === image) break;
    const after = `${match[1]}${match[2]}${image}${match[2]}${match[4]}`;
    changed.push({ before: lines[i], after });
    lines[i] = after;
    break;
  }
  return { text: lines.join("\n"), changed };
}
