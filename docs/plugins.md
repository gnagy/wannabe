# Writing plugins

Every command wannabe runs is a plugin: an executable file. The ones it ships are in `plugins/`; a project adds
its own in `.wannabe/plugins/`.

## Where plugins are found

`wannabe <group>... <command> [args]` follows the words down directories, then runs the executable it lands on.
It looks in the project's `.wannabe/plugins/` first, then in wannabe's own `plugins/`, so a project can add
commands, add commands to a shipped group, or replace a shipped command.

```
.wannabe/plugins/
  database/
    restored        # wannabe database restored --to local
  deployment/
    synced          # replaces wannabe's own deployment synced for this project
```

`helped` and `self` are built in, and no plugin can take either name.

## What a plugin gets

- **Its arguments, untouched.** wannabe parses nothing: a plugin that does not care about contexts does not have
  to accept `--to`.

- **Environment variables:**

  | Variable              | Value                                                                     |
  |-----------------------|---------------------------------------------------------------------------|
  | `WANNABE_HOME`        | wannabe's checkout                                                        |
  | `WANNABE_PROJECT_DIR` | the project root                                                          |
  | `WANNABE_DIR`         | the project's `.wannabe/`                                                 |
  | `WANNABE_DRY_RUN`     | `1` when run as `wannatry`, or with `--dry-run` parsed by `lib/plugin.ts` |

- **`wannabe self get <file> <path>`**, to read configuration without a YAML parser.

A plugin that runs other wannabe commands, as the shortcuts do, gets the same project: wannabe keeps
`WANNABE_PROJECT_DIR` when it is already set.

## The header

The first comment lines after the shebang are the plugin's help, whatever the language — `#` or `//` comments:

```ts
#!/usr/bin/env bun
// wannabe: --to <context> [--dry-run] — restore the context's database from the newest dump
//
// Reads spec.dumps from .wannabe/<context>/database.yaml. Refuses any context but local.
```

- The line starting `wannabe:` is the usage, shown in listings. Its `--flags` are what completion offers.
- The comment lines below it are what `wannabe helped <group> <command>` prints.

A plugin can be written in anything that runs as an executable; a shell script works as well as TypeScript.

## The contract

- **Honour the dry run or refuse it.** Under `WANNABE_DRY_RUN=1`, print what would change and change nothing.
- **stdout is the result, stderr is for people.** A command that produces a value (a tag, a path) prints only
  that on stdout, so shortcuts and scripts can capture it.
- **Exit codes:** 0 success; 1 failure; 2 a wrong call (a missing argument, an unknown context); 3 not possible
  in this context, with a message saying who or what does it instead.
- **Be safe to rerun where you can.** A command named for a state (`synced`, `committed`) should end in that
  state however often it runs.

## `lib/plugin.ts`

A plugin in TypeScript can import what wannabe's own plugins use:

```ts
import { get, host, parseArgs, run } from "../../lib/plugin.ts"; // from wannabe's plugins/; a project's plugin imports it from $WANNABE_HOME

const args = parseArgs(process.argv.slice(2), { flags: ["--quiet"] }); // --to/--from/--in, --dry-run, and these
const target = await host(args.context);                               // exit 3 when the context has no host
await run(["ssh", target, "uptime"]);                                  // only printed in a dry run
```

| Function                                       | Does                                                                                                                                                        |
|------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `parseArgs(argv, { flags, options, context })` | the context from `--to`/`--from`/`--in`, `--dry-run`, and the declared flags and options; anything else exits 2. `context: "none"` for commands without one |
| `get(file, path)`, `getOptional`, `getList`    | a value from `.wannabe/<file>.yaml`; `get` exits 1 when it is missing                                                                                       |
| `run(command, { cwd, allowFailure, tty })`     | runs it with its output on stderr, or only prints it in a dry run                                                                                           |
| `capture(command)`                             | runs it and returns its exit code and output                                                                                                                |
| `say(message)`, `die(code, message)`           | print to stderr; `die` names the command and exits                                                                                                          |
| `host(context)`                                | the context's `spec.endpoints.host`, or exit 3                                                                                                              |
| `deployDir(context)`, `repoRoot(dir)`          | the deployment directory, resolved; the git repository holding a directory                                                                                  |
| `requireUpToDate(dir)`                         | fetches that repository and exits 1 when it is behind its upstream                                                                                          |
| `step(...words)`                               | runs another wannabe command; on failure names it and stops                                                                                                 |

`lib/compose.ts` reads a service's image from a compose file and sets it, changing one line and keeping the
rest as its author left it.

## Trust

A project's `.wannabe/plugins/` is code from whatever repository you run wannabe in. wannabe does not yet ask
you to trust a project before running its plugins; read them as you would any script you are about to run.
