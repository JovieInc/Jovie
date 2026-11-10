#!/usr/bin/env bash
# Prime $RUNNER_TOOL_CACHE/node/<version>/<arch> from nodejs.org, verified
# against the release SHASUMS256.txt, so actions/setup-node resolves the exact
# version from the toolcache and never calls the GitHub REST API for the
# node-versions manifest. Best effort: every failure path exits 0 and leaves
# setup-node to do what it always did.
#
# Test seams (hermetic tests): NODE_DIST_BASE, RUNNER_TOOL_CACHE,
# PRIME_NODE_PLATFORM, PRIME_NODE_ARCH.
set -uo pipefail

skip() { echo "prime-node-toolcache: $1; setup-node resolves Node itself."; exit 0; }

file="${NODE_VERSION_FILE:-.nvmrc}"
[ -f "$file" ] || skip "no $file"
version="$(tr -d '[:space:]' <"$file")"
version="${version#v}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || skip "$file is not one exact version"

cache="${RUNNER_TOOL_CACHE:-}"
[ -n "$cache" ] || skip "no RUNNER_TOOL_CACHE"
if [ -z "${PRIME_NODE_PLATFORM:-}" ] && [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
  skip "not a GitHub-hosted runner"
fi

platform="${PRIME_NODE_PLATFORM:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
machine="${PRIME_NODE_ARCH:-$(uname -m)}"
case "$machine" in
  x86_64|x64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) skip "unsupported arch $machine" ;;
esac
case "$platform" in
  linux|darwin) ;;
  *) skip "unsupported platform $platform" ;;
esac

dest="$cache/node/$version/$arch"
if [ -f "$dest.complete" ]; then
  echo "prime-node-toolcache: node $version already in the toolcache."
  exit 0
fi

base="${NODE_DIST_BASE:-https://nodejs.org/dist}/v$version"
name="node-v$version-$platform-$arch.tar.gz"
work="$(mktemp -d)" || skip "no temp dir"
trap 'rm -rf "$work"' EXIT

curl --fail --silent --show-error --location --retry 3 --max-time 120 \
  --output "$work/$name" "$base/$name" || skip "download of $name failed"
curl --fail --silent --show-error --location --retry 3 --max-time 30 \
  --output "$work/SHASUMS256.txt" "$base/SHASUMS256.txt" || skip "no SHASUMS256.txt"

expected="$(awk -v f="$name" '$2 == f { print $1 }' "$work/SHASUMS256.txt")"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || skip "no checksum for $name"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$work/$name" | awk '{print $1}')"
else
  actual="$(shasum -a 256 "$work/$name" | awk '{print $1}')"
fi
# A mismatch is a corrupt or tampered download: never install it.
[ "$actual" = "$expected" ] || skip "checksum mismatch for $name"

rm -rf "$dest"
mkdir -p "$dest" || skip "cannot create $dest"
if ! tar -xz --strip-components=1 -C "$dest" -f "$work/$name"; then
  rm -rf "$dest"
  skip "extract failed"
fi
touch "$dest.complete"
echo "prime-node-toolcache: node $version primed at $dest (no GitHub API call)."
