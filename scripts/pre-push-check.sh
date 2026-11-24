#!/usr/bin/env bash
# Run by .githooks/pre-push (enabled via `git config core.hooksPath .githooks`,
# which `npm install`/`npm ci` sets through the "prepare" script).
#
# git passes one line per pushed ref on stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
# Each line is checked on its own, based on the *remote* branch name being written
# (not the branch that happens to be checked out):
#   - deletions (all-zero local sha) are allowed and not reviewed;
#   - tags and other non-branch refs are not reviewed;
#   - branch names must start with feature/, fix/ or chore/; claude/ is rejected;
#     main/master are allowed with a notice;
#   - every new commit being pushed gets `scripts/review.sh branch --full --ref <sha>`
#     (in a temporary worktree when it isn't the checked-out commit).
# Run by hand with no stdin, it checks the current branch as if pushing it.
# Bypass in an emergency with `git push --no-verify`.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

lines=()
if [[ ! -t 0 ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && lines+=("$line")
  done
fi
if ((${#lines[@]} == 0)); then
  current=$(git branch --show-current)
  if [[ -z "$current" ]]; then
    echo "pre-push: detached HEAD and no refs on stdin; nothing to check." >&2
    exit 0
  fi
  lines=("refs/heads/$current $(git rev-parse HEAD) refs/heads/$current 0000000000000000000000000000000000000000")
fi

errors=0
targets=()  # "<sha> <branch>" pairs to review
for line in "${lines[@]}"; do
  read -r _local_ref local_sha remote_ref remote_sha <<<"$line"
  if [[ "$local_sha" =~ ^0+$ ]]; then
    echo "pre-push: deleting $remote_ref (no review needed)."
    continue
  fi
  if [[ "$remote_ref" != refs/heads/* ]]; then
    echo "pre-push: $remote_ref is not a branch; skipping branch checks."
    continue
  fi
  branch="${remote_ref#refs/heads/}"
  case "$branch" in
    feature/* | fix/* | chore/*) ;;
    claude/*)
      echo "pre-push: branch '$branch' uses the claude/ prefix; rename it to feature/, fix/ or chore/." >&2
      errors=$((errors + 1))
      continue
      ;;
    main | master)
      echo "pre-push: pushing directly to '$branch'."
      ;;
    *)
      echo "pre-push: branch '$branch' should start with feature/, fix/ or chore/." >&2
      errors=$((errors + 1))
      continue
      ;;
  esac
  if [[ "$local_sha" == "$remote_sha" ]]; then
    echo "pre-push: '$branch' is already up to date on the remote; nothing to review."
    continue
  fi
  targets+=("$local_sha $branch")
done

if ((errors > 0)); then
  echo "pre-push: push blocked by $errors branch-name problem(s)." >&2
  exit 1
fi

reviewed=" "
for t in "${targets[@]}"; do
  read -r sha branch <<<"$t"
  [[ "$reviewed" == *" $sha "* ]] && continue  # same commit pushed to several branches
  reviewed+="$sha "
  echo "pre-push: reviewing '$branch' (${sha:0:7})"
  if ! bash scripts/review.sh branch --full --ref "$sha" --name "$branch"; then
    echo "pre-push: review failed for '$branch'; push blocked." >&2
    exit 1
  fi
done
exit 0
