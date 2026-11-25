#!/usr/bin/env bash
# Prove that each check fails when it should.
#
# Usage: tests/run_tests.sh

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIX="$ROOT/tests/fixtures"
cd "$ROOT" || exit 2

passed=0
failed=0

expect() {
  local label="$1" want="$2"
  shift 2
  local output status
  output="$("$@" 2>&1)"
  status=$?
  if [ "$status" -eq "$want" ]; then
    echo "ok   $label"
    passed=$((passed + 1))
  else
    echo "FAIL $label: expected exit $want, got $status"
    printf '%s\n' "$output" | sed 's/^/     /'
    failed=$((failed + 1))
  fi
}

expect "check_repo accepts valid fixtures" 0 python3 scripts/check_repo.py --root "$FIX/valid"
expect "check_repo rejects broken fixtures" 1 python3 scripts/check_repo.py --root "$FIX/invalid"
expect "check_portability rejects violations" 1 scripts/check_portability.sh "$FIX/pii/sample.txt"
expect "check_portability accepts a clean file" 0 scripts/check_portability.sh "$FIX/clean.txt"
expect "check_portability accepts the repository" 0 scripts/check_portability.sh
expect "gen_index agrees with the tree" 0 python3 scripts/gen_index.py --check

# A file may talk about the markers in prose without that mention becoming the
# generated region.
tmp="$(mktemp -d)"
for entry in AGENTS.md README.md scripts skills agents mcps; do cp -a "$ROOT/$entry" "$tmp/"; done
printf '\nA file may mention <!-- GENERATED:BEGIN --> in prose.\n' >> "$tmp/AGENTS.md"
expect "gen_index ignores markers in prose" 0 python3 scripts/gen_index.py --root "$tmp"
if grep -qx -- '- `agents/research/scout/AGENT.md`' "$tmp/AGENTS.md"; then
  echo "ok   gen_index kept the real region"
  passed=$((passed + 1))
else
  echo "FAIL gen_index lost the real region"
  failed=$((failed + 1))
fi
rm -rf "$tmp"

echo "tests: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
