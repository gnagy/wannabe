/**
 * Registry sign-in without a stored Docker login: a Docker configuration in a scratch directory that holds the
 * credentials for one registry, for the commands run with it to read through DOCKER_CONFIG, as Jib does.
 * The scratch directory is private to the user and removed when the process ends, however it ends.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** The user's own Docker configuration, minus anything that would answer for the registry before our entry. */
function ownConfig(host: string): Record<string, any> {
  const path = join(process.env.DOCKER_CONFIG ?? join(homedir(), ".docker"), "config.json");
  let config: Record<string, any> = {};
  if (existsSync(path)) {
    try {
      config = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // An unreadable configuration is not ours to repair; the scratch one stands alone.
    }
  }
  // A credential helper is asked before the auths entries, so one for this registry would win over ours.
  if (config.credHelpers) delete config.credHelpers[host];
  return config;
}

/** Writes the scratch configuration and returns the directory to point DOCKER_CONFIG at. */
export function registryConfig(host: string, username: string, password: string): string {
  const directory = mkdtempSync(join(tmpdir(), "wannabe-docker-"));
  chmodSync(directory, 0o700);
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  process.on("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => process.exit(130));

  const config = ownConfig(host);
  config.auths = { ...config.auths, [host]: { auth: Buffer.from(`${username}:${password}`).toString("base64") } };
  writeFileSync(join(directory, "config.json"), JSON.stringify(config), { mode: 0o600 });
  return directory;
}
