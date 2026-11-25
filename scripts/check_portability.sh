#!/usr/bin/env bash
# Fail when a committed file carries machine-specific or personal values.
#
# Usage:
#   scripts/check_portability.sh                 scan the repository
#   scripts/check_portability.sh <path>...       scan exactly those paths
#
# Test fixtures and this script are excluded from the default scan: the
# fixtures contain synthetic violations on purpose, and the patterns below
# would match themselves.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF_REL="scripts/check_portability.sh"

PATTERNS=(
  '/home/'
  '/Users/'
  '/root/'
  'C:\\\\'
  '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'
  '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}'
  '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
  'sk-[A-Za-z0-9_-]{16,}'
  'ghp_[A-Za-z0-9]{20,}'
  'AKIA[0-9A-Z]{16}'
  # Account-bound provider and model ids. Extend as they appear.
  'neuralwatt'
  'glm-5'
  'deepseek'
  'opencode-go'
)

explicit=("$@")

if [ "${#explicit[@]}" -gt 0 ]; then
  files=()
  for p in "${explicit[@]}"; do
    if [ -f "$p" ]; then files+=("$p"); else echo "missing path: $p" >&2; exit 2; fi
  done
else
  files=()
  while IFS= read -r rel; do
    case "$rel" in
      tests/fixtures/*) continue ;;
      "$SELF_REL") continue ;;
    esac
    files+=("$ROOT/$rel")
  done < <(cd "$ROOT" && git ls-files --cached --others --exclude-standard)
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "no files to scan"
  exit 0
fi

status=0
for pattern in "${PATTERNS[@]}"; do
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    echo "portability: $hit"
    status=1
  done < <(grep -InE -- "$pattern" "${files[@]}" 2>/dev/null || true)
done

if [ "$status" -eq 0 ]; then
  echo "portability: clean (${#files[@]} files)"
fi
exit "$status"
