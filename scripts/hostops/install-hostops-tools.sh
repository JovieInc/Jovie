#!/usr/bin/env bash
# Install Jovie host tooling from this checkout (idempotent).
#
#   scripts/hostops/install-hostops-tools.sh             # install / refresh
#   scripts/hostops/install-hostops-tools.sh --uninstall # remove links, restore slot.sh
#
# Installs the host admission gate (host-admit) into a content-addressed release under
# ~/.local/share/jovie-hostops/releases/<digest>, flips ~/.local/share/jovie-hostops/current,
# and links ~/.local/bin/host-admit to it. On a host with the artdir codex queue
# (~/codex-ship-prompts/artdir, override HOSTOPS_ARTDIR), slot.sh becomes a link to the
# repo's codex-slot.sh shim; the original is kept once as slot.sh.pre-host-admit.
# Running agents are untouched: the gate only governs new launches.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
share="$HOME/.local/share/jovie-hostops"
bin="$HOME/.local/bin"
artdir="${HOSTOPS_ARTDIR:-$HOME/codex-ship-prompts/artdir}"
files=(host_admit.py host-admit host-admit.json codex-slot.sh)

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$bin/host-admit"
  if [[ -L "$artdir/slot.sh" && -f "$artdir/slot.sh.pre-host-admit" ]]; then
    mv -f "$artdir/slot.sh.pre-host-admit" "$artdir/slot.sh"
  fi
  echo "host-admit removed (state kept in ~/.local/state/jovie-hostops)"
  exit 0
fi

digest="$(cd "$src" && cat "${files[@]}" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-16)"
release="$share/releases/$digest"
if [[ ! -d "$release" ]]; then
  mkdir -p "$release.tmp"
  for f in "${files[@]}"; do install -m 0644 "$src/$f" "$release.tmp/$f"; done
  chmod 0755 "$release.tmp/host-admit" "$release.tmp/host_admit.py"
  mv "$release.tmp" "$release"
fi
ln -sfn "$release" "$share/current.tmp" && mv -Tf "$share/current.tmp" "$share/current" 2>/dev/null \
  || { rm -f "$share/current"; mv "$share/current.tmp" "$share/current"; }
mkdir -p "$bin"
ln -sfn "$share/current/host-admit" "$bin/host-admit"

if [[ -d "$artdir" ]]; then
  if [[ -f "$artdir/slot.sh" && ! -L "$artdir/slot.sh" && ! -e "$artdir/slot.sh.pre-host-admit" ]]; then
    cp -p "$artdir/slot.sh" "$artdir/slot.sh.pre-host-admit"
  fi
  ln -sfn "$share/current/codex-slot.sh" "$artdir/slot.sh"
  echo "artdir slot.sh -> host-admit agent shim"
fi

echo "host-admit installed: release $digest"
"$bin/host-admit" status
