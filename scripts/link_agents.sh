#!/usr/bin/env bash
# Development helper, not an installer.
#
# Harnesses read agents one directory level deep, while this repository groups
# them by category. This script links each agent directory into the harness
# agents directory, preserving its references/scripts/tests.
#
# Usage:
#   scripts/link_agents.sh --dry-run
#   scripts/link_agents.sh
#   PI_AGENT_DIR=<dir> scripts/link_agents.sh
#
# It never deletes and never overwrites: an existing target that is not a
# symlink to the same source is reported and skipped.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ROOT="${PI_AGENT_DIR:-$HOME/.pi/agent}/agents"
dry_run=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -d "$ROOT/agents" ]; then
  echo "no agents directory in $ROOT" >&2
  exit 2
fi

[ "$dry_run" -eq 1 ] || mkdir -p "$TARGET_ROOT"

linked=0
skipped=0

while IFS= read -r agent_file; do
  src="$(dirname "$agent_file")"
  name="$(basename "$src")"
  dest="$TARGET_ROOT/$name"

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ -L "$dest" ] && [ "$(readlink -f "$dest")" = "$(readlink -f "$src")" ]; then
      echo "unchanged: $name"
      skipped=$((skipped + 1))
      continue
    fi
    echo "skipped: $dest exists and is not this agent" >&2
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$dry_run" -eq 1 ]; then
    echo "would link: $src -> $dest"
  else
    ln -s "$src" "$dest"
    echo "linked: $name -> $dest"
  fi
  linked=$((linked + 1))
done < <(find "$ROOT/agents" -mindepth 3 -maxdepth 3 -name AGENT.md | sort)

echo "agents: $linked linked, $skipped skipped, target $TARGET_ROOT"
