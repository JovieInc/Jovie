#!/usr/bin/env bash
# Builds the commit a change lands on (the merge group's base), so the
# dashboard Lighthouse gate can measure base and head on the same runner.
#
#   build    Check the base commit out in place, build it, move its standalone
#            server to $BASELINE_DIR and report built=true. The gate moves it
#            back to apps/web/.next/standalone while it measures base: a
#            standalone build only resolves its packages from there. Any reason it
#            cannot (no base, changed dependencies, failed build, a crash)
#            reports built=false and exits 0: the gate then enforces every
#            configured budget as it is, so a missing baseline can neither
#            fail the job nor weaken the gate.
#   restore  Put the workspace back on the exact head, remove what the base
#            build left behind, and fail if the tree is not the head's.
#
# In place, not in a second worktree: node_modules resolves workspace packages
# by path, so a base tree elsewhere would compile head's packages, and
# Turbopack's build cache is only warm at the same path. That is also why a
# change to what pnpm installs skips the baseline
# (.github/scripts/lighthouse-install-scope.mjs).
set -euo pipefail
export LC_ALL=C

mode="${1:?usage: lighthouse-build-baseline.sh build|restore}"
state_dir="${RUNNER_TEMP:?}/lighthouse-baseline-state"

# The build checks another commit out over this file, and the base commit may
# not have it at all. Run from a copy outside the workspace; the workflow's
# restore step calls that copy. Its install-scope helper travels with it.
stable_copy="$RUNNER_TEMP/lighthouse-build-baseline.sh"
install_scope="$RUNNER_TEMP/lighthouse-install-scope.mjs"
if [ "$(realpath "$0")" != "$(realpath -m "$stable_copy")" ]; then
  cp "$0" "$stable_copy"
  # A missing helper means "cannot tell", which skips the baseline.
  cp "$(dirname "$0")/lighthouse-install-scope.mjs" "$install_scope" 2>/dev/null ||
    rm -f "$install_scope"
  exec bash "$stable_copy" "$@"
fi
head_file="$state_dir/head-sha"
before_file="$state_dir/untracked-before"

# grep exits 1 when it prints nothing; an empty list is a valid answer (a
# clean checkout has no untracked files outside node_modules), not a failure.
list_untracked() {
  {
    git ls-files -z --others --exclude-standard --directory
    git ls-files -z --others --ignored --exclude-standard --directory
  } | { grep -zv -e '^node_modules/' -e '/node_modules/' || true; } | sort -z -u
}

clear_build_output() {
  # Keep the compiler cache; drop every build output so head's build starts
  # from what a fresh checkout would have.
  if [ -d apps/web/.next ]; then
    find apps/web/.next -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} +
  fi
}

skip() {
  echo "::notice::Lighthouse baseline not built: $1. The gate enforces the configured budgets as they are."
  echo "built=false" >> "$GITHUB_OUTPUT"
  exit 0
}

case "$mode" in
  build)
    : "${BASELINE_DIR:?}" "${GITHUB_OUTPUT:?}"
    # The work runs in a child so an unexpected error is a missing baseline,
    # not a failed step. The restore step puts the workspace back either way.
    if ! bash "$0" build-inner; then
      echo "::warning::Lighthouse baseline build stopped unexpectedly. The gate enforces the configured budgets as they are."
      echo "built=false" >> "$GITHUB_OUTPUT"
    fi
    ;;
  build-inner)
    mkdir -p "$state_dir"
    head_sha="$(git rev-parse HEAD)"
    base_sha="${BASE_SHA:-}"
    if [ -z "$base_sha" ]; then
      # Manual dispatch has no merge-group base; compare with main's head.
      base_sha="$(git ls-remote origin refs/heads/main | cut -f1)"
    fi
    [[ "$base_sha" =~ ^[0-9a-f]{40}$ ]] || skip "no exact base commit"
    [ "$base_sha" != "$head_sha" ] || skip "head is the base commit"
    [ -z "$(git status --porcelain --untracked-files=no)" ] ||
      skip "the workspace has modified tracked files"
    git fetch --quiet --no-tags --depth=1 origin "$base_sha" ||
      skip "could not fetch base $base_sha"
    # Only a change to what pnpm installs (lockfile, workspace config, a
    # workspace package's dependency fields) makes the in-place base build
    # wrong. A version bump, a script edit or a package.json outside the
    # workspace does not; skipping on those enforced noisy absolute budgets
    # (run 43008412182: scripts/security/deepsec/package.json).
    install_change="$(node "$install_scope" "$base_sha" "$head_sha")" ||
      skip "could not compare dependency installs between base and head"
    if [ "$install_change" != "same" ]; then
      skip "dependency installs differ between base and head (${install_change#changed })"
    fi

    list_untracked > "$before_file"
    echo "$head_sha" > "$head_file"
    git checkout --quiet --detach "$base_sha"
    echo "Building base $base_sha for the Lighthouse baseline."
    if ! timeout --kill-after=15 600 pnpm --filter=@jovie/web run build; then
      skip "the base build failed"
    fi
    server=apps/web/.next/standalone/apps/web/server.js
    [ -f "$server" ] || skip "the base build left no standalone server"
    rm -rf "$BASELINE_DIR"
    mv apps/web/.next/standalone "$BASELINE_DIR"
    {
      echo "sha=$base_sha"
      echo "server=$BASELINE_DIR/apps/web/server.js"
      echo "built=true"
    } >> "$GITHUB_OUTPUT"
    ;;
  restore)
    # Nothing was switched if the build step never recorded a head.
    [ -f "$head_file" ] || exit 0
    head_sha="$(cat "$head_file")"
    git checkout --quiet --detach --force "$head_sha"
    clear_build_output
    if [ -f "$before_file" ]; then
      list_untracked > "$state_dir/untracked-after"
      comm -z -13 "$before_file" "$state_dir/untracked-after" |
        while IFS= read -r -d '' leftover; do
          case "$leftover" in
            apps/web/.next/ | apps/web/.next/*) ;;
            *) rm -rf -- "$leftover" ;;
          esac
        done
    fi
    [ "$(git rev-parse HEAD)" = "$head_sha" ] || {
      echo "::error::Workspace is not on head $head_sha after the baseline build."
      exit 1
    }
    [ -z "$(git status --porcelain --untracked-files=no)" ] || {
      echo "::error::Tracked files differ from head after the baseline build:"
      git status --porcelain --untracked-files=no
      exit 1
    }
    echo "Workspace restored to head $head_sha."
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 2
    ;;
esac
