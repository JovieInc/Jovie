#!/usr/bin/env bash
# Minimal smoke tests for scripts/agent/preflight.sh (JOV-4183)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SCRIPT="$ROOT/scripts/agent/preflight.sh"
fail() { echo "FAIL: $*" >&2; exit 1; }

# 1) Emits valid JSON with required keys on clean tree
out=$(bash "$SCRIPT" 2>/dev/null) || true
echo "$out" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for k in ("schema","ownership","worktree","gstack","goal","verdict","blockers","ms_total"):
  assert k in d, k
assert d["schema"]=="agent-preflight/v1"
assert d["verdict"] in ("go","blocked")
print("ok keys+schema")
'

# 2) Dirty worktree → blocked
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git clone --quiet --depth 1 "file://$ROOT" "$tmp/repo" 2>/dev/null || {
  # fallback: init bare-ish copy via worktree
  git worktree add --detach "$tmp/repo" HEAD >/dev/null 2>&1
}
cd "$tmp/repo"
echo dirty > .preflight-dirty-test
set +e
out=$(bash "$SCRIPT" 2>/dev/null)
code=$?
set -e
echo "$out" | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d["verdict"]=="blocked", d
assert any(b["code"]=="worktree_dirty" for b in d["blockers"]), d["blockers"]
print("ok dirty-blocked")
'
[ "$code" -eq 1 ] || fail "expected exit 1 on dirty, got $code"

# 3) Missing script fallback is skill-side; ensure --help works
bash "$SCRIPT" --help >/dev/null

echo "ALL PASS"
