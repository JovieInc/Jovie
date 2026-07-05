#!/usr/bin/env bash
# Pre-push Biome check, scoped to the files this branch changed.
#
# Why scoped (gh#12475): the old repo-wide `biome check .` failed the pre-push
# gate on PRE-EXISTING drift in files a branch never touched (apps/web/app/
# globals.css, apps/web/styles/design-system.css, the biome.json schema pin).
# A perpetually-red gate just trains everyone to reach for
# JOVIE_SKIP_PRE_PUSH_GATE=1, which defeats the gate. CI already scopes Biome to
# changed files (.github/workflows/ci.yml `ci-biome`), so this mirrors CI: you
# only answer for what you changed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

BIOME="$REPO_ROOT/node_modules/.bin/biome"

# Pick the freshest available base ref to diff against. Skip any ref that points
# at HEAD (e.g. pushing `main` itself with no `origin/main`): diffing HEAD
# against HEAD finds nothing and would silently skip the commits being pushed.
HEAD_SHA="$(git rev-parse HEAD)"
BASE=""
for ref in origin/main main; do
  if git rev-parse --verify -q "$ref" >/dev/null &&
    [[ "$(git rev-parse "$ref")" != "$HEAD_SHA" ]]; then
    BASE="$ref"
    break
  fi
done

if [[ -z "$BASE" ]]; then
  # No usable base ref (shallow/detached clone, or base == HEAD) — fall back to a
  # full check rather than silently linting nothing.
  echo "[biome-pre-push] no usable base ref; checking whole repo"
  exec "$BIOME" check .
fi

echo "[biome-pre-push] checking files changed since $BASE"
# --changed diffs committed snapshots vs $BASE (matches CI), so uncommitted
# working-tree edits are linted once committed — i.e. before they can be pushed.
exec "$BIOME" check --changed --since="$BASE" --no-errors-on-unmatched .
