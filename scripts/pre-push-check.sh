#!/usr/bin/env bash
# Run by .githooks/pre-push (enabled via `git config core.hooksPath .githooks`,
# which `npm install`/`npm ci` sets through the "prepare" script).
# Blocks the push if branch naming or the full branch review fails.
# Bypass in an emergency with `git push --no-verify`.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

branch=$(git branch --show-current)
case "$branch" in
  feature/* | fix/* | chore/*) ;;
  claude/*)
    echo "pre-push: branch '$branch' uses the claude/ prefix; rename it to feature/, fix/ or chore/." >&2
    exit 1
    ;;
  main | master)
    echo "pre-push: pushing directly to '$branch'." >&2
    ;;
  *)
    echo "pre-push: branch '$branch' should start with feature/, fix/ or chore/." >&2
    exit 1
    ;;
esac

# Nothing to check when the push only deletes remote refs. git passes one line per ref:
# "<local ref> <local sha> <remote ref> <remote sha>"; a deletion has an all-zero local sha.
# stdin is a terminal/empty when run by hand, which counts as a normal push.
refs=0
deletions=0
if [[ ! -t 0 ]]; then
  while read -r _local_ref local_sha _remote_ref _remote_sha; do
    refs=$((refs + 1))
    [[ "$local_sha" =~ ^0+$ ]] && deletions=$((deletions + 1))
  done
fi
if ((refs > 0 && refs == deletions)); then exit 0; fi

exec scripts/review.sh branch --full
