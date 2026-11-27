# refactor-report

An MCP server that measures a TypeScript tree and previews a refactoring of it
without writing to the tree.

Two verbs, both read-only. A report is what the caller reads; a change is what the
caller applies outside this server, with its own editor or patch.

## What it exposes

`measure` reports where the code stands. Per file it answers the path, the lines of
code, the function count, the largest cyclomatic complexity with the line it starts
on, how many modules import it and the sha256 of its bytes. The scope is one of four
areas, a function, a class, a module or the whole repository, or a diff against a
base commit. Every number travels with the command that reproduces it.

`preview` reports what a rule set would do. It takes a recipe and the paths it may
touch, and answers the paths and ranges that would change, a line diff, the delta
each file's metrics would carry, the digest of the change and `applied: false`. The
edited text is held in memory and rendered; the tree is never written.

## Requirements

Node 22.19 or newer. The tests run on `node --test`, which strips the TypeScript
types of the sources without a build step.

## Install and build

```sh
npm ci
npm run build
```

`npm ci` installs exactly what `package-lock.json` pins. `npm run build` writes
`dist/`, which holds the two entries: `dist/index.js` for the stdio transport and
`dist/cli.js` for the argv form of the same two verbs.

## Configuration

The transport is stdio. The server measures the working directory of the process,
so it is launched from the root of the project it reports on, and the answer echoes
that root as `"."` instead of an absolute path.

The shape of an entry is the one [`harness/mcp.example.json`](../../harness/mcp.example.json)
shows. Every value below is a placeholder; a generated configuration belongs to the
harness that reads it.

```json
{
  "mcpServers": {
    "refactor-report": {
      "command": "node",
      "args": [
        "<path to mcps/refactor-report/dist/index.js>"
      ],
      "description": "measure a TypeScript tree and preview a refactoring without writing to disk"
    }
  }
}
```

## Rulesets

The rules travel with the server as YAML in `rulesets/`, and a recipe names one as
`<file>.yaml#sha256:<12>`: the twelve characters are the prefix of the digest of the
published bytes, so a rule set edited after a recipe was written stops resolving
instead of running something else. `RULESET_DIR` points the loader at another
directory. The kinds of rule are a closed set in the code; the YAML only
parameterises them, and no threshold, verdict or priority lives in either.

## Scripts

| Script | What it does |
|---|---|
| `npm test` | Runs the unit tests on `node --test`, with no build step. |
| `npm run test:protocol` | Builds and speaks the protocol to `dist/index.js` over stdio: initialize, `tools/list`, and the `tools/call` refusals the schema and the service name. |
| `npm run test:cli` | Builds and replays each `evidence` command of a `measure` and of a `preview` answer from the tree the answer read, comparing the value it printed. |
| `npm run typecheck` | Type-checks the sources, the tests and both entries with `tsc --noEmit`. |
| `npm run build` | Emits `dist/` from `tsconfig.build.json`. |

`npm test` carries the read-only guarantee of this package, twice. The static check
reads the sources and refuses a filesystem write, a program other than `git` with the
three subcommands `rev-parse`, `diff` and `ls-files`, and a runtime dependency
outside the four the manifest pins. The dynamic check measures and previews a tree
and compares its sha256 manifest before and after; it skips unless
`REFACTOR_REPORT_TARGET` names the tree to measure, for example:

```sh
REFACTOR_REPORT_TARGET=src npm test
```

## What it does not do

It does not write, it does not apply a change, and it does not judge. There is no
quality threshold, no verdict and no priority in this server: those belong to the
skill that reads its reports. It measures TypeScript only, and never claims to have
measured JavaScript, Java or Scala.
