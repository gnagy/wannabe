# Concepts

## Contexts

A **context** is one environment: `local`, `test`, `prod`. It is a directory in `.wannabe/`, holding a
`context.yaml` that says where the environment is — its endpoints — and a file per resource saying what runs
there. Commands name the context they act on: `--to test` for what changes it, `--from test` or `--in test`
for what reads it. The words differ for reading's sake; wannabe treats them alike.

A context is deliberately like a Kubernetes context: where, and as whom. It differs in holding as many endpoints
as the environment has — the application, the deploy host, later a database or a log source — rather than one
cluster.

## Resources

What runs in a context is described by **resources**: small YAML documents, one per file, each with a `kind`.
A `Deployment` says where the compose files are and how the service is checked; a `DockerImage` how the image is
pushed; a `GradleBuild` which Gradle tasks do what. [config.md](config.md) lists them.

Keeping them small and typed, instead of one configuration file, is what lets commands stay independent: each
reads the kinds it needs and nothing else, and a kind can change shape without touching the others.

## Groups and commands

Commands come in groups, named after what they act on, and say the state wanted:

```bash
wannabe gradle built
wannabe docker pushed
wannabe deployment pinned --to test
wannabe deployment synced --to test
wannabe deployment committed --to test --push
```

The words are states, not verbs, because most commands are safe to run again: running `synced` twice ends in
the same place as running it once. That is also what makes the small steps useful when something fails: fix the
cause, run the failed step again, carry on.

## Shortcuts

`wannabe released` and `wannabe deployed` run a sequence of steps and stop at the first that fails, naming it.
They add nothing the steps do not; they save typing when nothing goes wrong. Committing a deployment is left out
of `deployed` on purpose: it records that the environment was verified, which a script cannot know.

## Three names

- `wannabe` — the command.
- `wannatry` — the same, as a dry run: nothing changes, and every step says what it would do.
- `wannado` — the same again, for when an action reads better than a state (`wannado logs tail`).

## Plugins

Every command is a plugin: an executable found in the project's `.wannabe/plugins/` or in wannabe's own
`plugins/`. A project can add a command, or replace one of wannabe's for itself. [plugins.md](plugins.md) says
how to write one.

## Exit codes

| Code | Meaning                                                                                         |
|------|-------------------------------------------------------------------------------------------------|
| 0    | success                                                                                         |
| 1    | failure                                                                                         |
| 2    | a wrong call: a missing argument, an unknown context, no project here                           |
| 3    | not possible in this context — a context without a host is not deployed by wannabe, for example |
