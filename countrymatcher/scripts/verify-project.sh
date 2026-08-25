#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"
VERIFY_VENV="$APP_DIR/.verify-venv"
REQUIREMENTS_FILE="$APP_DIR/requirements.txt"
REQUIREMENTS_STAMP="$VERIFY_VENV/.requirements.sha256"
PYTHON_BOOTSTRAP="${PYTHON:-python3}"
GIT_AVAILABLE=0
COMMIT_SHA="unavailable"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "=== VERIFY 1/7: STRUCTURE AND TOOLING SYNTAX ==="
[[ -f "$REPO_ROOT/verify" ]] || fail "root verify wrapper is missing"
[[ -f "$APP_DIR/package.json" ]] || fail "countrymatcher/package.json is missing"
[[ -f "$APP_DIR/package-lock.json" ]] || fail "countrymatcher/package-lock.json is missing"
[[ -f "$REQUIREMENTS_FILE" ]] || fail "countrymatcher/requirements.txt is missing"
command -v node >/dev/null 2>&1 || fail "node is not available"
command -v npm >/dev/null 2>&1 || fail "npm is not available"
command -v "$PYTHON_BOOTSTRAP" >/dev/null 2>&1 || fail "$PYTHON_BOOTSTRAP is not available"
bash -n "$REPO_ROOT/verify"
bash -n "$SCRIPT_DIR/verify-project.sh"
node --check "$SCRIPT_DIR/ensure-node-deps.mjs"
echo "PASS: project structure and verifier syntax"

echo
echo "=== VERIFY 2/7: GIT CHECKS ==="
if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_AVAILABLE=1
  COMMIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  git -C "$REPO_ROOT" diff --check
  git -C "$REPO_ROOT" diff --cached --check

  if git -C "$REPO_ROOT" rev-parse --verify HEAD^ >/dev/null 2>&1; then
    git -C "$REPO_ROOT" diff --check HEAD^ HEAD
  else
    echo "Git parent commit unavailable; committed-diff check skipped."
  fi

  TRACKED_VERIFY_MODE="$(git -C "$REPO_ROOT" ls-files -s -- verify | awk 'NR == 1 { print $1 }')"
  if [[ -n "$TRACKED_VERIFY_MODE" && "$TRACKED_VERIFY_MODE" != "100755" ]]; then
    fail "tracked root verify must have git mode 100755, got $TRACKED_VERIFY_MODE"
  fi

  echo "PASS: Git checks (HEAD $COMMIT_SHA)"
else
  echo "Git metadata unavailable; Git-only checks skipped."
fi

echo
echo "=== VERIFY 3/7: NODE DEPENDENCIES ==="
cd "$APP_DIR"
npm ci

echo
echo "=== VERIFY 4/7: PYTHON VALIDATOR ENVIRONMENT ==="
REQ_HASH="$("$PYTHON_BOOTSTRAP" - "$REQUIREMENTS_FILE" <<'PY'
from hashlib import sha256
from pathlib import Path
import sys
print(sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"

NEED_VENV=0
if [[ ! -x "$VERIFY_VENV/bin/python" ]]; then
  NEED_VENV=1
elif [[ ! -f "$REQUIREMENTS_STAMP" ]]; then
  NEED_VENV=1
elif [[ "$(cat "$REQUIREMENTS_STAMP")" != "$REQ_HASH" ]]; then
  NEED_VENV=1
elif ! "$VERIFY_VENV/bin/python" -c 'import jsonschema' >/dev/null 2>&1; then
  NEED_VENV=1
fi

if [[ "$NEED_VENV" -eq 1 ]]; then
  rm -rf "$VERIFY_VENV"
  "$PYTHON_BOOTSTRAP" -m venv "$VERIFY_VENV"
  "$VERIFY_VENV/bin/python" -m pip install --disable-pip-version-check -r "$REQUIREMENTS_FILE"
  printf '%s\n' "$REQ_HASH" > "$REQUIREMENTS_STAMP"
else
  echo "Python validator environment is current."
fi

PYTHON_VERIFY="$VERIFY_VENV/bin/python"

echo
echo "=== VERIFY 5/7: ACTIVE RP4 PACKAGES ==="
shopt -s nullglob
PACKAGES=("$APP_DIR"/data/*-research-v4.0.json)
if [[ "${#PACKAGES[@]}" -eq 0 ]]; then
  fail "no RP4 packages found"
fi
for package in "${PACKAGES[@]}"; do
  echo "--- $(basename "$package") ---"
  "$PYTHON_VERIFY" "$APP_DIR/data/validate-v4.0.py" "$package"
done

echo
echo "=== VERIFY 6/7: NODE TEST SUITE ==="
PATH="$VERIFY_VENV/bin:$PATH" npm test

echo
echo "=== VERIFY 7/7: JAVASCRIPT SYNTAX ==="
find "$APP_DIR/js" "$APP_DIR/matcher" "$APP_DIR/pilot" -name '*.js' -print0 | xargs -0 -n1 node --check

echo
if [[ "$GIT_AVAILABLE" -eq 1 ]]; then
  echo "PASS: Country Matcher project verification complete (HEAD $COMMIT_SHA)"
else
  echo "PASS: Country Matcher project verification complete (Git metadata unavailable)"
fi
