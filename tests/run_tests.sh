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
expect "check_repo rejects a summary too long for the index" 1 python3 scripts/check_repo.py --root "$FIX/summary-bad"
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

expect "check_changelog accepts a valid changelog" 0 python3 scripts/check_changelog.py --root "$FIX/changelog/valid"
for case in "$FIX"/changelog/invalid/*/; do
  expect "check_changelog rejects $(basename "$case")" 1 python3 scripts/check_changelog.py --root "$case"
done
expect "check_changelog accepts this repository" 0 python3 scripts/check_changelog.py

expect "check_links accepts resolvable links" 0 python3 scripts/check_links.py --root "$FIX/links/valid"
expect "check_links rejects a dangling link" 1 python3 scripts/check_links.py --root "$FIX/links/invalid"
expect "check_links accepts this repository" 0 python3 scripts/check_links.py

expect "check_mirror accepts two mirrored prompts" 0 python3 scripts/check_mirror.py --en "$FIX/mirror/valid/PROMPT.md" --es "$FIX/mirror/valid/PROMPT.es.md"
expect "check_mirror rejects a drifted pair" 1 python3 scripts/check_mirror.py --en "$FIX/mirror/invalid/PROMPT.md" --es "$FIX/mirror/invalid/PROMPT.es.md"
expect "check_mirror accepts this repository" 0 python3 scripts/check_mirror.py

expect "check_overlap reports a high overlap" 1 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/high.json" skills/demo/demo-a/SKILL.md
expect "check_overlap accepts distinct artifacts" 0 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/none.json" skills/demo/demo-a/SKILL.md

out="$(python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/with-cost.json" skills/demo/demo-a/SKILL.md)"
if printf '%s\n' "$out" | grep -q '^check_overlap: cost '; then
  echo "ok   check_overlap prints the cost block"
  passed=$((passed + 1))
else
  echo "FAIL check_overlap did not print the cost block"
  failed=$((failed + 1))
fi
expect "check_overlap reads an exact tie as high" 1 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/tie.json" skills/demo/demo-a/SKILL.md
expect "check_overlap rejects an incomplete response" 2 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/missing-answer.json" skills/demo/demo-a/SKILL.md
expect "check_overlap rejects non-numeric probabilities" 2 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/bad-probability.json" skills/demo/demo-a/SKILL.md
expect "check_overlap names missing configuration" 2 env -u TOOLKIT_JUDGE_BASE_URL -u TOOLKIT_JUDGE_MODEL -u TOOLKIT_JUDGE_API_KEY python3 scripts/check_overlap.py --root "$FIX/overlap/tree" skills/demo/demo-a/SKILL.md
expect "check_overlap rejects a path that is not an artifact" 2 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --response-file "$FIX/overlap/high.json" README.md

expect "check_overlap rejects an unresolvable base" 2 python3 scripts/check_overlap.py --added-since nosuchref
expect "check_overlap reports nothing added" 0 python3 scripts/check_overlap.py --added-since HEAD
expect "check_overlap rejects two sources of candidates" 2 python3 scripts/check_overlap.py --all skills/general/writing-agent-skills/SKILL.md
expect "check_overlap rejects a saved response for a full audit" 2 python3 scripts/check_overlap.py --root "$FIX/overlap/tree" --all --response-file "$FIX/overlap/none.json"

# --added-since takes the candidates from git: a commit that adds an artifact
# is judged against the catalog of that tree.
tmp="$(mktemp -d)"
mkdir -p "$tmp/skills/demo"
cp -a "$FIX/overlap/tree/skills/demo/demo-a" "$FIX/overlap/tree/skills/demo/demo-b" "$tmp/skills/demo/"
cp -a "$FIX/overlap/tree/agents" "$tmp/"
git -C "$tmp" init -q
git -C "$tmp" add -A
git -C "$tmp" -c user.name=t -c user.email=t -c commit.gpgsign=false commit -qm base
cp -a "$tmp/skills/demo/demo-a" "$tmp/skills/demo/demo-c"
sed 's/^name: demo-a$/name: demo-c/' "$tmp/skills/demo/demo-c/SKILL.md" > "$tmp/skills/demo/demo-c/SKILL.new"
mv "$tmp/skills/demo/demo-c/SKILL.new" "$tmp/skills/demo/demo-c/SKILL.md"
git -C "$tmp" add -A
git -C "$tmp" -c user.name=t -c user.email=t -c commit.gpgsign=false commit -qm "add demo-c"
expect "check_overlap judges the artifact a commit added" 1 python3 scripts/check_overlap.py --root "$tmp" --response-file "$FIX/overlap/added.json" --added-since HEAD~1
rm -rf "$tmp"

expect "check_repo rejects a dangling skill reference" 1 python3 scripts/check_repo.py --root "$FIX/refs-bad"

# find-pi-session resolves paths and stays read-only.
find_session="skills/pi-tooling/find-pi-session/scripts/find_pi_session.py"
sess="$(mktemp -d)"
out="$(PI_SESSION_ID=fixture PI_SESSION_FILE="$sess/s.jsonl" python3 "$find_session")"
if [ "$out" = "$sess/s.files" ] && [ ! -e "$out" ]; then
  echo "ok   find-pi-session resolves without creating"
  passed=$((passed + 1))
else
  echo "FAIL find-pi-session resolve: $out"
  failed=$((failed + 1))
fi

out="$(PI_SESSION_ID="fixture-$$" env -u PI_SESSION_FILE python3 "$find_session")"
if [ "$out" = "/tmp/pi/session/fixture-$$" ] && [ ! -e "$out" ]; then
  echo "ok   find-pi-session handles ephemeral sessions"
  passed=$((passed + 1))
else
  echo "FAIL find-pi-session ephemeral: $out"
  failed=$((failed + 1))
fi

PI_SESSION_ID=fixture PI_SESSION_FILE="$sess/s.jsonl" python3 "$find_session" --create >/dev/null
if [ -d "$sess/s.files" ]; then
  echo "ok   find-pi-session creates on request"
  passed=$((passed + 1))
else
  echo "FAIL find-pi-session --create did nothing"
  failed=$((failed + 1))
fi

expect "find-pi-session exits 2 outside pi" 2 env -u PI_SESSION_ID -u PI_SESSION_FILE python3 "$find_session"
rm -rf "$sess"

echo "tests: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
