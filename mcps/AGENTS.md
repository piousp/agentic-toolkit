# MCP servers

Rules for this directory.

## Scope

Only MCP servers written here are published. A server maintained elsewhere is used from its own package, never wrapped and vendored, so that its license, version and fixes stay with its authors.

## Structure

```text
mcps/<name>/
  README.md       what it exposes, how to run it, which transport
  package.json    if it is a Node package
  src/
```

No `node_modules`, no build output, no bundled binaries. The README states the install command and the config snippet a user copies into their harness.

## Configuration

`mcp.example.json` at the repository root shows the shape of an entry and contains no real paths: every value is a placeholder. A generated config belongs to the user, not to this repository.

## Index

<!-- GENERATED:BEGIN -->
<!-- GENERATED:END -->
