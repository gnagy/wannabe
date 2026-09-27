# Design

Why wannabe is shaped the way it is, and what was weighed before it. What it does is in
[concepts.md](concepts.md).

## The problem it started from

A Spring Boot application, deployed with Docker Compose to a handful of hosts, had its operations spread over
scripts: one to build and push the image, one to sync compose files to the test host and restart the service,
others to restore a database, fetch logs from a container UI, run SQL against test. Each hard-coded the facts it
needed — hosts, directories, service names, URLs — so every fact about an environment was written several times,
and a new environment meant editing every script.

What any replacement had to provide:

- **One place per fact.** An environment's host, deploy directory or URL is written once.
- **Nothing machine-specific and no secrets in committed files.** Relative paths follow a project convention,
  such as the infra repository sitting beside the application's.
- **Small steps.** When a chain fails half-way, carry on from the failed step instead of starting over.
- **Room to grow.** A new operation, or a new way of doing one, must not mean changing the others.

## Why Kubernetes' shape

A move to Kubernetes was planned. Modelled on it, the configuration and the habits carry over and only the
scripts are thrown away; modelled on anything else, all three would be. What wannabe copies:

- **Contexts.** An environment is a context. Kubernetes has one endpoint per context; wannabe has as many as the
  environment needs.
- **Small typed resources instead of one model.** A command reads the kinds it needs and nothing else, and each
  kind can change shape on its own.
- **Plugins found by name.** kubectl and git find `kubectl-<name>` and `git-<name>` on `PATH`; wannabe finds
  `<group>/<command>` in plugin directories. Like kubectl, it passes plugins their arguments untouched.

What Kubernetes adds on top — reconciling controllers, in-cluster networking, GitOps — wannabe does not imitate.
After a move to a cluster those come from the cluster, and the matching wannabe commands become thin wrappers or
disappear. For applications that will never run on one, wannabe is the permanent tool.

## Options weighed

| Option                                                     | In short                                                                                     | Why not                                                                                                          |
|------------------------------------------------------------|----------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| A command-line tool reading one config                     | One file names the environments, and per environment which command implements each operation | A tool to build and distribute, duplicating what a task runner does                                              |
| Shared [mise](https://mise.jdx.dev) task packs             | `task_config.includes` pulls task files from a repository at a pinned tag                    | An include brings tasks but not settings, and whether a project's task overrides an included one is undocumented |
| A master config plus generators writing mise configuration | Facts in one file; each tool writes complete mise tasks into `.mise/conf.d/`                 | Sound, but a second layer to understand, and mise-specific                                                       |
| [Kamal](https://kamal-deploy.org)                          | Destinations, logs, accessories, secret adapters: the closest in concept                     | It performs the deploy itself, over ssh, with its own proxy                                                      |
| Ansible, Capistrano, Fabric                                | Inventories and tasks over ssh                                                               | Built around pushing to hosts; heavy for local work                                                              |
| DevSpace, Skaffold, Garden                                 | Profiles, logs, pipelines                                                                    | Kubernetes only                                                                                                  |
| **Contexts and typed resources, shaped like Kubernetes**   | This                                                                                         | —                                                                                                                |

## Decisions along the way

- **YAML, not TOML.** Resource documents with a `kind` are YAML's ground, and Kubernetes manifests will be YAML.
  The YAML 1.1 trap of reading an unquoted tag like `20260927_140721` as a number does not bite: Bun follows
  YAML 1.2.
- **The core parses no flags.** Some plugins will not care about contexts; a shared `lib/plugin.ts` parses them
  for the ones that do.
- **Groups named after what they act on**, not after the tool doing it: `deployment synced`, not
  `compose synced`, so the command keeps its name when compose is replaced.
- **Two reserved names, `helped` and `self`**, so every other name belongs to plugins.
- **Committing a deployment is a separate step**, never part of the `deployed` shortcut: it records that the
  environment was verified.
- **Bun and TypeScript.** One runtime that starts fast enough for completion on every Tab, reads YAML and
  JSON without extra packages, runs the tests, and compiles to a single binary. Compose files are read as YAML
  and edited one line at a time, so their comments and quoting survive.
- **Plugins are executables, not modules.** A command can be written in anything; the shipped ones are
  TypeScript run by Bun, and a project's may be a shell script.

## Open questions

1. How plugins from outside a project and outside wannabe are installed, versioned and pinned per project.
2. Credentials: a context naming a command whose output is the secret, as kubeconfig's `exec` plugins do, with an
   environment variable overriding it for CI.
3. Trusting a project before running its plugins, as mise asks.
4. Reading an application's metrics when they sit behind its sign-in.
