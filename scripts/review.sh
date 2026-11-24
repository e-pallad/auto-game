#!/usr/bin/env bash
# Self-review before committing or pushing.
#
#   scripts/review.sh staged            # staged changes (npm run review)
#   scripts/review.sh branch            # all commits on this branch vs base (npm run review:branch)
#   scripts/review.sh <mode> --full     # also build and run the Playwright e2e suite
#
# Base branch for "branch" mode: $REVIEW_BASE, else the first that exists of
# origin/HEAD, master, main, origin/master, origin/main. If none exists (e.g. the
# default branch has no commits yet) the whole branch history is reviewed.
#
# Blocking checks: secrets, forbidden files, conflict markers, focused tests (.only),
# `debugger` statements, files over 5 MB, typecheck, unit tests (and e2e with --full).
# Warnings only: console.log in src/, new TODO/FIXME, files over 1 MB.
set -uo pipefail

mode="${1:-staged}"
full=0
[[ "${2:-}" == "--full" || "${1:-}" == "--full" ]] && full=1
[[ "$mode" == "--full" ]] && mode="staged"

cd "$(git rev-parse --show-toplevel)" || exit 1

red=$'\e[31m'; yellow=$'\e[33m'; green=$'\e[32m'; bold=$'\e[1m'; reset=$'\e[0m'
[[ -t 1 ]] || { red=; yellow=; green=; bold=; reset=; }
errors=0
warnings=0
fail() { echo "${red}✗ $*${reset}"; errors=$((errors + 1)); }
warn() { echo "${yellow}! $*${reset}"; warnings=$((warnings + 1)); }
ok() { echo "${green}✓ $*${reset}"; }

empty_tree=$(git hash-object -t tree /dev/null)

case "$mode" in
  staged)
    range_desc="staged changes"
    diff_args=(--cached)
    ;;
  branch)
    base_ref="${REVIEW_BASE:-}"
    if [[ -z "$base_ref" ]]; then
      for cand in origin/HEAD master main origin/master origin/main; do
        if git rev-parse --verify -q "$cand^{commit}" >/dev/null; then base_ref="$cand"; break; fi
      done
    fi
    if [[ -n "$base_ref" ]] && git rev-parse --verify -q "$base_ref^{commit}" >/dev/null; then
      base=$(git merge-base "$base_ref" HEAD)
      range_desc="branch $(git branch --show-current) vs $base_ref"
    else
      base="$empty_tree"
      range_desc="entire history of $(git branch --show-current) (no base branch found)"
    fi
    diff_args=("$base" HEAD)
    ;;
  *)
    echo "usage: $0 staged|branch [--full]" >&2
    exit 2
    ;;
esac

echo "${bold}Reviewing ${range_desc}${reset}"
mapfile -t files < <(git diff "${diff_args[@]}" --name-only --diff-filter=ACMR)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "No changed files."
  exit 0
fi
echo "${#files[@]} changed file(s)"

# Files whose *contents* are exempt from pattern checks (they contain the patterns).
is_exempt() { [[ "$1" == "scripts/review.sh" ]]; }

# ---- file-level checks ----
for f in "${files[@]}"; do
  base_name=$(basename "$f")
  case "$f" in
    .env | .env.* | */.env | */.env.* | credentials.json | */credentials.json | .claude/settings.local.json | *.pem | *.key | *.p12 | id_rsa* | */id_rsa*)
      [[ "$base_name" == ".env.example" ]] || fail "forbidden file (likely secrets): $f"
      ;;
    node_modules/* | dist/* | release/* | test-results/*)
      fail "build/dependency output should not be committed: $f"
      ;;
  esac
  if [[ "$mode" == "staged" ]]; then
    size=$(git cat-file -s ":$f" 2>/dev/null || echo 0)
  else
    size=$(git cat-file -s "HEAD:$f" 2>/dev/null || echo 0)
  fi
  if ((size > 5 * 1024 * 1024)); then
    fail "file over 5 MB: $f ($size bytes)"
  elif ((size > 1024 * 1024)); then
    warn "file over 1 MB: $f ($size bytes)"
  fi
done

# ---- added-line checks ----
# Emit "file<TAB>line" for every added line in text files.
added=$(git diff "${diff_args[@]}" -U0 --no-color --diff-filter=ACMR | awk '
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+\+\+ /    { file = ""; next }
  /^\+/ && file != "" { print file "\t" substr($0, 2) }
')

scan() { # scan <severity> <message> <extended-regex> [file-regex]
  local sev="$1" msg="$2" re="$3" file_re="${4:-.}"
  local hits
  hits=$(printf '%s\n' "$added" | while IFS=$'\t' read -r f line; do
    [[ -z "$f" ]] && continue
    is_exempt "$f" && continue
    [[ "$f" =~ $file_re ]] || continue
    if [[ "$line" =~ $re ]]; then printf '    %s: %s\n' "$f" "${line:0:140}"; fi
  done)
  if [[ -n "$hits" ]]; then
    if [[ "$sev" == fail ]]; then fail "$msg"; else warn "$msg"; fi
    printf '%s\n' "$hits" | head -20
  fi
}

scan fail "possible secret" '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|(api[_-]?key|secret|password|token)[\"'"'"']?[[:space:]]*[:=][[:space:]]*[\"'"'"'][^\"'"'"' ]{8,})'
scan fail "merge conflict marker" '^(<<<<<<<|>>>>>>>)( |$)|^=======$'
scan fail "focused test (.only) would skip the rest of the suite" '\b(test|it|describe)\.only\(' '^tests/'
scan fail "debugger statement" '(^|[^[:alnum:]_])debugger;' '\.(ts|js|mjs)$'
scan warn "console.log in game source" 'console\.log\(' '^src/'
scan warn "new TODO/FIXME" '\b(TODO|FIXME|XXX)\b' '\.(ts|js|mjs|sh|css|html)$'

# ---- project checks ----
run() { # run <label> <command...>
  local label="$1"; shift
  local out
  if out=$("$@" 2>&1); then
    ok "$label"
  else
    fail "$label failed"
    printf '%s\n' "$out" | tail -25
  fi
}

if [[ -f package.json ]]; then
  if [[ ! -d node_modules ]]; then
    fail "node_modules missing: run npm ci"
  else
    run "typecheck" npm run --silent typecheck
    run "unit tests" npm run --silent test
    if ((full)); then run "build + e2e tests" npm run --silent test:e2e; fi
  fi
fi

echo
if ((errors > 0)); then
  echo "${red}${bold}Review failed: ${errors} error(s), ${warnings} warning(s).${reset}"
  exit 1
fi
echo "${green}${bold}Review passed${reset} (${warnings} warning(s))."
