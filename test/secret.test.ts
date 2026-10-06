import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scratch, wannabe } from "./helpers.ts";

const SECRETS = `kind: Secrets
spec:
  acr-token:
    description: Registry token, from the Azure portal
  from-command:
    command: [sh, -c, "echo fetched"]
  broken-command:
    command: [sh, -c, "exit 3"]
`;

/** A project with declared secrets and a private store, so nothing touches the real one. */
function setup() {
  const project = scratch({ ".wannabe/secrets.yaml": SECRETS, ".wannabe/test/context.yaml": "kind: Context\nspec: {}\n" });
  const store = scratch();
  const run = (args: string[], extra: Record<string, string> = {}, stdin = "") =>
    wannabe(project, args, "wannabe", { WANNABE_SECRET_STORE: store, ...extra }, stdin);
  return { project, store, run };
}

describe("secret stored / checked / forgotten", () => {
  test("a piped value is stored, found, and never printed", () => {
    const { run } = setup();
    const stored = run(["secret", "stored", "acr-token"], {}, "s3cret-value\n");
    expect(stored.code).toBe(0);
    expect(stored.stderr).toContain("stored 'acr-token'");

    const checked = run(["secret", "checked"]);
    expect(checked.stdout).toContain("acr-token\tin the secret store");
    expect(checked.stdout + checked.stderr).not.toContain("s3cret-value");
  });

  test("storing again replaces the value; forgetting removes it, and forgetting twice is fine", () => {
    const { run } = setup();
    run(["secret", "stored", "acr-token"], {}, "one");
    run(["secret", "stored", "acr-token"], {}, "two");
    expect(run(["secret", "forgotten", "acr-token"]).stderr).toContain("forgot 'acr-token'");
    expect(run(["secret", "forgotten", "acr-token"]).code).toBe(0);
    expect(run(["secret", "checked"]).stdout).toContain("acr-token\tMISSING");
  });

  test("an empty value stores nothing", () => {
    const { run } = setup();
    const empty = run(["secret", "stored", "acr-token"], {}, "\n");
    expect(empty.code).toBe(1);
    expect(empty.stderr).toContain("nothing stored");
  });

  test("checked reports where each secret comes from, and exits 1 for a missing one", () => {
    const { run } = setup();
    const checked = run(["secret", "checked"], { WANNABE_SECRET_ACR_TOKEN: "from-ci" });
    expect(checked.code).toBe(1);
    expect(checked.stdout).toContain("acr-token\tfrom WANNABE_SECRET_ACR_TOKEN");
    expect(checked.stdout).toContain("from-command\tfrom its command");
    expect(checked.stdout).toContain("broken-command\tMISSING: its command failed (exit 3)");
    expect(checked.stdout).not.toContain("from-ci");
  });

  test("the environment wins over the store, and the store says so", () => {
    const { run } = setup();
    const stored = run(["secret", "stored", "acr-token"], { WANNABE_SECRET_ACR_TOKEN: "ci" }, "local");
    expect(stored.stderr).toContain("WANNABE_SECRET_ACR_TOKEN takes precedence");
  });

  test("a project with no declared secrets is not possible for checked", () => {
    const project = scratch({ ".wannabe/test/context.yaml": "kind: Context\nspec: {}\n" });
    expect(wannabe(project, ["secret", "checked"]).code).toBe(3);
  });

  test("a dry run stores nothing", () => {
    const { run } = setup();
    expect(run(["secret", "stored", "acr-token", "--dry-run"], {}, "x").stderr).toContain("dry run");
    expect(run(["secret", "checked"]).stdout).toContain("acr-token\tMISSING");
  });
});

describe("docker pushed with spec.registry", () => {
  const DOCKER = `kind: DockerImage
spec:
  pushTasks: [jib]
  registry:
    host: registry.example.com
    usernameSecret: reg-user
    passwordSecret: reg-pass
`;
  // A stand-in for gradlew: keeps what Jib would read, and reports the image as pushed.
  const GRADLEW = `#!/bin/sh
cp "$DOCKER_CONFIG/config.json" "$PWD/seen.json"
echo "$DOCKER_CONFIG" > "$PWD/seen.dir"
mkdir -p build
echo '{"image":"registry.example.com/app:7","imagePushed":true}' > build/jib-image.json
`;
  const project = () => scratch({ ".wannabe/docker.yaml": DOCKER, gradlew: GRADLEW });

  test("signs in from a scratch Docker config, keeps the user's own, and removes it afterwards", () => {
    const dir = project();
    const own = scratch({
      "config.json": JSON.stringify({ credsStore: "other", credHelpers: { "registry.example.com": "stale", "x.io": "keep" } }),
    });
    const run = wannabe(dir, ["docker", "pushed"], "wannabe", {
      DOCKER_CONFIG: own,
      WANNABE_SECRET_REG_USER: "alice",
      WANNABE_SECRET_REG_PASS: "pw",
    });
    expect(run.code).toBe(0);
    expect(run.stdout.trim()).toBe("7");

    const seen = JSON.parse(readFileSync(join(dir, "seen.json"), "utf8"));
    expect(Buffer.from(seen.auths["registry.example.com"].auth, "base64").toString()).toBe("alice:pw");
    expect(seen.credsStore).toBe("other");
    expect(seen.credHelpers).toEqual({ "x.io": "keep" });
    expect(existsSync(readFileSync(join(dir, "seen.dir"), "utf8").trim())).toBe(false);
    expect(run.stderr).not.toContain("pw");
  });

  test("a missing secret stops the push and says how to store it", () => {
    const run = wannabe(project(), ["docker", "pushed"], "wannabe", { WANNABE_SECRET_REG_USER: "alice", WANNABE_SECRET_STORE: scratch() });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("no secret 'reg-pass'");
    expect(run.stderr).toContain("wannabe secret stored reg-pass");
  });

  test("a dry run signs in to nothing and reads no secret", () => {
    const run = wannabe(project(), ["docker", "pushed", "--dry-run"], "wannabe", { WANNABE_SECRET_STORE: scratch() });
    expect(run.stderr).toContain("would sign in to registry.example.com");
  });
});
