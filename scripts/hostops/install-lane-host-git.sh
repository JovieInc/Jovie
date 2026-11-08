#!/usr/bin/env bash
# Give a lane host (Gem, Ubuntu) a Git that meets the repo floor (JOV-11391).
#
#   scripts/hostops/install-lane-host-git.sh            # install/upgrade if below the floor
#   scripts/hostops/install-lane-host-git.sh --check    # verify only, exit 1 when below the floor
#
# Repo script tests and scripts/review-escapes.mjs run `git --no-lazy-fetch`, which needs
# Git >= 2.44. Ubuntu 24.04 ships 2.43, so this adds the official git-core PPA and upgrades
# the `git` package. Idempotent: when `git --no-lazy-fetch --version` already works it
# changes nothing. The same floor is probed by scripts/lanes/host_git.py (MIN_GIT).
# Needs root or passwordless sudo; it never prompts.
set -euo pipefail

PPA="${LANE_GIT_PPA:-ppa:git-core/ppa}"
MIN_MAJOR=2
MIN_MINOR=44

meets_floor() {
  local out ver major minor
  out="$(git --version 2>/dev/null)" || return 1
  ver="${out##* }"
  major="${ver%%.*}"
  minor="${ver#*.}"; minor="${minor%%.*}"
  [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || return 1
  (( major > MIN_MAJOR || (major == MIN_MAJOR && minor >= MIN_MINOR) )) || return 1
  git --no-lazy-fetch --version >/dev/null 2>&1
}

if meets_floor; then
  echo "git ok: $(git --version) (--no-lazy-fetch accepted)"
  exit 0
fi

if [[ "${1:-}" == "--check" ]]; then
  echo "host-git-below-minimum: $(git --version 2>&1) is below ${MIN_MAJOR}.${MIN_MINOR}" >&2
  exit 1
fi

if [[ "$(id -u)" == "0" ]]; then
  SUDO=()
elif sudo -n true 2>/dev/null; then
  SUDO=(sudo -n)
else
  echo "need root or passwordless sudo to install git from $PPA" >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
"${SUDO[@]}" apt-get update -qq
"${SUDO[@]}" apt-get install -y -qq software-properties-common
"${SUDO[@]}" add-apt-repository -y "$PPA"
"${SUDO[@]}" apt-get update -qq
"${SUDO[@]}" apt-get install -y -qq git

if meets_floor; then
  echo "git installed: $(git --version) (--no-lazy-fetch accepted)"
else
  echo "host-git-below-minimum: after install $(git --version 2>&1) still fails git --no-lazy-fetch" >&2
  exit 1
fi
