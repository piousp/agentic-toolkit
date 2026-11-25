#!/usr/bin/env sh
# Run every offline check before a push.
#
# Usage:
#   scripts/pre_push.sh                              by hand
#   ln -s ../../scripts/pre_push.sh .git/hooks/pre-push
#
# Git calls a pre-push hook with the remote name and URL as arguments and the
# refs to push on stdin; this script ignores both and checks the whole tree.
#
# The overlap check is not here: it needs a model that belongs to an account,
# so it runs in CI, where the key is. A hook is convenience, not enforcement:
# it can be skipped with --no-verify and it does not exist for anyone who never
# installed it.
#
# The tree is checked as it is, not the index: unrelated work in progress can
# fail the hook. That is the price of not stashing.

set -u

# The script is installed as a symlink in .git/hooks, so the path it was called
# with is not where it lives: follow the links before taking the parent.
target="$0"
while [ -L "$target" ]; do
  link="$(readlink "$target")"
  case "$link" in
    /*) target="$link" ;;
    *) target="$(dirname "$target")/$link" ;;
  esac
done
ROOT="$(cd "$(dirname "$target")/.." && pwd)"
cd "$ROOT" || exit 2

status=0
run() {
  printf 'pre-push: %s\n' "$1"
  shift
  "$@" || status=1
}

run "portability" scripts/check_portability.sh
run "artifact structure" python3 scripts/check_repo.py
run "generated index" python3 scripts/gen_index.py --check
run "changelog format" python3 scripts/check_changelog.py
run "relative links" python3 scripts/check_links.py
run "prompt mirror" python3 scripts/check_mirror.py

if [ "$status" -eq 0 ]; then
  printf 'pre-push: every check passed\n'
else
  printf 'pre-push: a check failed; fix it, or push with --no-verify\n'
fi
exit "$status"
