#!/usr/bin/env bash
# Migration: v0.15.2.0 — Fix skill directory structure for unprefixed discovery
#
# What changed: setup now creates real directories with SKILL.md symlinks
# inside instead of directory symlinks. The old pattern (qa -> gstack/qa)
# caused Claude Code to auto-prefix skills as "gstack-qa" even with
# --no-prefix, because Claude sees the symlink target's parent dir name.
#
# What this does: runs gstack-relink to recreate all skill entries using
# the new real-directory pattern. Idempotent — safe to run multiple times.
#
# Affected: users who installed gstack before v0.15.2.0 with --no-prefix
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
INSTALL_DIR="${GSTACK_INSTALL_DIR:-$SCRIPT_DIR}"
SKILLS_DIR="${GSTACK_SKILLS_DIR:-}"
HOST_CONTEXT="${GSTACK_HOST_CONTEXT:-unknown}"

if [ "$HOST_CONTEXT" != "claude" ] || [ -z "$SKILLS_DIR" ]; then
  echo "  [v0.15.2.0] Skipping Claude relink; no Claude install context provided."
  exit 0
fi

if [ -x "$INSTALL_DIR/bin/gstack-relink" ]; then
  echo "  [v0.15.2.0] Fixing skill directory structure..."
  set +e
  relink_output="$(
    GSTACK_INSTALL_DIR="$INSTALL_DIR" \
    GSTACK_SKILLS_DIR="$SKILLS_DIR" \
    "$INSTALL_DIR/bin/gstack-relink" 2>&1
  )"
  relink_exit=$?
  set -e

  if [ $relink_exit -ne 0 ]; then
    printf "  [v0.15.2.0] Warning: relink failed (exit %s). %s\n" "$relink_exit" "$relink_output" >&2
  elif [ -n "$relink_output" ]; then
    printf '%s\n' "$relink_output"
  fi
fi
