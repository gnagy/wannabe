import { children, contexts, describe, descend, type Env, isDirectory, locate, pluginHeader } from "./project.ts";
import { selfUsage } from "./self.ts";

const pad = (text: string, width: number) => text.padEnd(width);

/** A group's commands with their usage lines, as printed when a call is incomplete. */
export function listing(env: Env, rel: string): string {
  const lines = [rel ? `Commands in ${rel.replaceAll("/", " ")}:` : "Commands:"];
  if (!rel) {
    lines.push(`  ${pad("helped", 12)} (built-in) [<group> [<command>]] — what the commands do, and how wannabe works`);
    lines.push(`  ${pad("self", 12)} (built-in) installed, uninstalled, completion, get, version`);
  }
  for (const child of children(env, rel)) {
    lines.push(`  ${pad(child, 12)} ${describe(locate(env, rel ? `${rel}/${child}` : child)!)}`);
  }
  return lines.join("\n");
}

/** Every command under a group, indented by depth. */
function tree(env: Env, rel: string, indent: string): string[] {
  const lines: string[] = [];
  for (const child of children(env, rel)) {
    const childRel = rel ? `${rel}/${child}` : child;
    const path = locate(env, childRel)!;
    if (isDirectory(path)) {
      lines.push(`${indent}${child}`);
      lines.push(...tree(env, childRel, `${indent}  `));
    } else {
      lines.push(`${indent}${pad(child, 12)} ${describe(path)}`);
    }
  }
  return lines;
}

/** wannabe helped [<group>... [<command>]]: returns the text, or throws with an exit code. */
export function helped(env: Env, args: string[]): string {
  if (args[0] === "self") return selfUsage();
  const { rel, consumed } = descend(env, args);
  const words = rel ? rel.split("/") : [];
  if (args.length > consumed) {
    const command = args[consumed];
    const path = locate(env, rel ? `${rel}/${command}` : command);
    if (!path || isDirectory(path)) {
      throw new HelpError(`${env.name}: no command '${command}' in ${rel ? rel.replaceAll("/", " ") : "the top level"}; wannabe helped lists them`);
    }
    const full = [...words, command].join(" ");
    const header = pluginHeader(path).map((line) => line.replace(/^wannabe:\s*/, `Usage: wannabe ${full} `));
    const origin = path.startsWith(env.home + "/") ? `Built into wannabe: ${path}` : `From this project: ${path}`;
    return [...header, "", origin].join("\n");
  }
  if (rel) return [`wannabe ${words.join(" ")} — commands:`, ...tree(env, rel, "  ")].join("\n");

  const project = env.project
    ? [`Project: ${env.project}`, `Contexts: ${contexts(env).join(" ")}`]
    : ["No project here: commands run inside a directory holding .wannabe/, or below one."];
  return [
    "wannabe — say what you want to be true of an environment, one small step at a time.",
    "",
    "  wannabe <group> <command> --to <context>    e.g. wannabe deployment synced --to test",
    "  wannatry <group> <command> ...              the same, as a dry run",
    "  wannado <group> <command> ...               another name, when an action reads better",
    "",
    ...project,
    "",
    "Commands:",
    ...tree(env, "", "  "),
    "",
    "Built-ins:",
    "  helped [<group> [<command>]]   this, or one group or command in detail",
    "  self                           installed, uninstalled, completion, get, version",
    "",
    "A failed shortcut stops at the step that failed and names it: fix the cause, then run the steps from there.",
    "Exit codes: 0 success, 1 failure, 2 wrong call, 3 not possible in this context.",
  ].join("\n");
}

export class HelpError extends Error {}
