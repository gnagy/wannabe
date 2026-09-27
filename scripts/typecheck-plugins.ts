/**
 * Type-checks the shipped plugins. They carry no .ts extension — the file name is the command's name — so tsc
 * does not pick them up; this copies them, with what they import, into a scratch directory as .ts files.
 */
import { cpSync, mkdtempSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "wannabe-typecheck-"));

function copyPlugins(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) copyPlugins(path);
    else cpSync(path, join(scratch, `${relative(root, path)}.ts`));
  }
}
copyPlugins(join(root, "plugins"));
for (const dir of ["lib", "src"]) cpSync(join(root, dir), join(scratch, dir), { recursive: true });
symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"));
const tsconfig = await Bun.file(join(root, "tsconfig.json")).json();
writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ ...tsconfig, include: ["plugins", "lib", "src"] }));

const result = Bun.spawnSync(["bunx", "tsc", "--noEmit", "-p", scratch], { stdout: "inherit", stderr: "inherit" });
process.exit(result.exitCode);
