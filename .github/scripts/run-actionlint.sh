#!/usr/bin/env bash
# Run actionlint from checksum-pinned upstream sources.
#
# Replaces the rhysd/actionlint Docker action, whose image the runner rebuilt
# at every job start (~26-33s) even when the step was skipped. The toolchain
# retains that image's checks, with the upstream stdin deadlock fix:
#   - actionlint fd33e9f582a01a02885c93ae3775e1190cf63653 fixes issue #650.
#     v1.7.12 writes scripts into a pipe before starting shellcheck/pyflakes;
#     a full pipe can hang indefinitely. No fixed release exists yet. Build
#     the exact verified upstream source with the existing Go toolchain and
#     its checked-in module checksums; use a truthful unreleased version.
#   - shellcheck v0.11.0: the image copied /bin/shellcheck from
#     koalaman/shellcheck-alpine:stable (sha256:c82fe425...9183 in CI logs).
#     That binary is byte-identical (sha256 below) to the upstream release
#     tarball's binary, which is pinned here too.
#   - pyflakes 3.4.0: the image's apk py3-pyflakes version, pinned by wheel
#     hash and run from the zip with the runner's python3.
# Tools are passed by absolute path, so the runner's preinstalled shellcheck
# is never used. Any download, checksum, platform, or version mismatch fails
# closed before linting. Arguments are forwarded to actionlint.
#
# Network: with PINNED_DOWNLOAD_CACHE_DIR set, every pinned download is kept in
# a content-addressed cache (file name = its sha256) and re-verified on each
# use, so a warm cache fetches no source, patch, shellcheck or pyflakes bytes.
# CI restores that directory from the cache main writes (tsc-cache-warm.yml).
# On a cold cache a failed shellcheck release download falls back to the
# digest-pinned koalaman/shellcheck image, whose /bin/shellcheck is the same
# bytes (same binary sha256 pin). GitHub release downloads failed 29 merge
# groups on 2026-11-08 and 2026-11-10.
set -euo pipefail

readonly ACTIONLINT_COMMIT='fd33e9f582a01a02885c93ae3775e1190cf63653'
readonly ACTIONLINT_VERSION='1.7.12+fd33e9f582a0.queue644076a59742'
readonly ACTIONLINT_SOURCE_SHA256='475da14da4ed169c493d4f988f2cd6e4f15434752635ad809e5613cc3cde6fcc'
# Unmerged contributor patch in upstream PR #654 validates GitHub's queue enum.
# Retain the pinned stdin fix until upstream releases both fixes together.
readonly ACTIONLINT_QUEUE_COMMIT='644076a59742c2d1540ebd4686eab3c308f0e562'
readonly ACTIONLINT_QUEUE_PATCH_SHA256='0378db3d77631edba189ecb92159417b0f5ed607d4ca41d370b4bfe1d4eee68f'
readonly SHELLCHECK_VERSION='0.11.0'
readonly SHELLCHECK_TARBALL_SHA256='8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198'
readonly SHELLCHECK_BINARY_SHA256='4da528ddb3a4d1b7b24a59d4e16eb2f5fd960f4bd9a3708a15baddbdf1d5a55b'
# Docker Hub index digest of koalaman/shellcheck:v0.11.0 (verified 2026-11-11:
# its linux/amd64 /bin/shellcheck has SHELLCHECK_BINARY_SHA256).
readonly SHELLCHECK_IMAGE='koalaman/shellcheck@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d'
readonly PYFLAKES_VERSION='3.4.0'
readonly PYFLAKES_WHEEL_SHA256='f742a7dbd0d9cb9ea41e9a24a918996e8170c799fa528688d40dd582c8265f4f'

fail() {
  echo "::error title=actionlint toolchain::$*" >&2
  exit 1
}

# Shellcheck retains the exact native artifacts already used in CI.
shellcheck_image=''
platform="$(uname -s) $(uname -m)"
case "$platform" in
  'Linux x86_64')
    actionlint_goos='linux'
    actionlint_goarch='amd64'
    shellcheck_platform='linux.x86_64'
    shellcheck_tarball_sha256="$SHELLCHECK_TARBALL_SHA256"
    shellcheck_binary_sha256="$SHELLCHECK_BINARY_SHA256"
    shellcheck_image="$SHELLCHECK_IMAGE"
    ;;
  'Darwin arm64')
    actionlint_goos='darwin'
    actionlint_goarch='arm64'
    shellcheck_platform='darwin.aarch64'
    shellcheck_tarball_sha256='56affdd8de5527894dca6dc3d7e0a99a873b0f004d7aabc30ae407d3f48b0a79'
    shellcheck_binary_sha256='61c17246d69f012cd458ae82f244c46023dac75d1b69733ca1cc7d28fb270fd7'
    ;;
  'Darwin x86_64')
    actionlint_goos='darwin'
    actionlint_goarch='amd64'
    shellcheck_platform='darwin.x86_64'
    shellcheck_tarball_sha256='3c89db4edcab7cf1c27bff178882e0f6f27f7afdf54e859fa041fca10febe4c6'
    shellcheck_binary_sha256='2589be755bb115f4421b8271eb7c08df1e03729f00350c1e4cf53b4a0bf9c2df'
    ;;
  *) fail "unsupported platform: $platform" ;;
esac

# macOS ships shasum, so use it without requiring GNU coreutils. Minimal
# Linux hosts may also use shasum; both verify the same SHA-256 manifest.
if [[ "$platform" == Darwin* ]] || ! command -v sha256sum >/dev/null; then
  command -v shasum >/dev/null || fail 'a SHA-256 verifier is required'
  sha256sum() { shasum -a 256 "$@"; }
fi

tool_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/actionlint-toolchain.XXXXXX")"
trap 'rm -rf "$tool_dir"' EXIT

# GitHub release downloads 504 in bursts longer than curl's default 3-retry
# window (1+2+4s); one burst failed a merge group on 10-12, and a 65s burst
# outlasted six retries on 11-08. Eight exponential retries ride out about
# four minutes of 5xx before failing closed. Release assets use
# scripts/lib/github-release-asset.sh (authenticated fallback).
sha_ok() { # file sha256
  printf '%s  %s\n' "$2" "$1" | sha256sum --check --status
}

# Optional content-addressed cache. An entry is trusted only after its bytes
# hash to its own name; a bad entry is dropped and fetched again.
cache_dir="${PINNED_DOWNLOAD_CACHE_DIR:-}"
if [[ -n "$cache_dir" ]] && ! mkdir -p "$cache_dir" 2>/dev/null; then
  cache_dir=''
fi

cache_get() { # sha256 out
  [[ -n "$cache_dir" && -f "$cache_dir/$1" ]] || return 1
  if sha_ok "$cache_dir/$1" "$1"; then
    cp "$cache_dir/$1" "$2"
    return 0
  fi
  rm -f "$cache_dir/$1"
  return 1
}

cache_put() { # file sha256 (already verified by the caller)
  [[ -n "$cache_dir" ]] || return 0
  local tmp
  tmp="$(mktemp "$cache_dir/.put.XXXXXX")" || return 0
  if cp "$1" "$tmp" && mv "$tmp" "$cache_dir/$2"; then return 0; fi
  rm -f "$tmp"
}

fetch() { # url out [release-attempts]; returns non-zero instead of exiting
  local url="$1" out="$2"
  if [[ "$url" == https://github.com/*/releases/download/* ]]; then
    RELEASE_DOWNLOAD_ATTEMPTS="${3:-${RELEASE_DOWNLOAD_ATTEMPTS:-6}}" \
      "${BASH:-bash}" "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/lib/github-release-asset.sh" \
      "$url" "$out"
  else
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      --retry 8 --retry-all-errors --max-time 120 --output "$out" "$url"
  fi
}

download() {
  local url="$1" out="$2" sha="$3"
  if cache_get "$sha" "$out"; then return 0; fi
  fetch "$url" "$out" || fail "download failed: $url"
  sha_ok "$out" "$sha" || fail "sha256 mismatch: $url"
  cache_put "$out" "$sha"
}

# Copy /bin/shellcheck out of the digest-pinned image. The caller verifies the
# binary sha256, so a wrong or tampered image fails closed.
shellcheck_from_image() { # out
  local cid
  [[ -n "$shellcheck_image" ]] && command -v docker >/dev/null 2>&1 || return 1
  docker pull --quiet "$shellcheck_image" >/dev/null || return 1
  cid="$(docker create "$shellcheck_image")" || return 1
  if docker cp "$cid:/bin/shellcheck" "$1"; then
    docker rm "$cid" >/dev/null 2>&1 || true
    return 0
  fi
  docker rm "$cid" >/dev/null 2>&1 || true
  return 1
}

download \
  "https://codeload.github.com/rhysd/actionlint/tar.gz/${ACTIONLINT_COMMIT}" \
  "$tool_dir/actionlint-source.tar.gz" "$ACTIONLINT_SOURCE_SHA256"
mkdir "$tool_dir/actionlint-source"
tar -xzf "$tool_dir/actionlint-source.tar.gz" -C "$tool_dir/actionlint-source" --strip-components=1
download \
  "https://github.com/rhysd/actionlint/commit/${ACTIONLINT_QUEUE_COMMIT}.patch" \
  "$tool_dir/actionlint-queue.patch" "$ACTIONLINT_QUEUE_PATCH_SHA256"
command -v go >/dev/null || fail 'Go is required to build the source-pinned actionlint (see its verified go.mod)'
(
  cd "$tool_dir/actionlint-source"
  patch --batch --forward --fuzz=0 -p1 < "$tool_dir/actionlint-queue.patch" || fail 'upstream queue patch failed'
  # Do not download an implicit compiler or use a caller's workspace/build flags.
  # Go's existing build cache avoids recompiling unchanged public dependencies.
  export GOTOOLCHAIN=local GOWORK=off GOFLAGS='' CGO_ENABLED=0
  export GOOS="$actionlint_goos" GOARCH="$actionlint_goarch"
  command -v cat >/dev/null || fail 'cat is required for the upstream stdin regression'
  go test -p=1 -mod=readonly -count=1 -timeout=20s \
    -run '^TestProcessConcurrentStdinDoesNotDeadlock$' \
    -coverprofile="$tool_dir/actionlint-pipe.coverage" . || fail 'upstream stdin regression failed'
  queue_tests="$tool_dir/actionlint-queue-tests.log"
  go test -p=1 -mod=readonly -count=1 -timeout=20s -v \
    -run '^TestLinterLintOK$/^concurrency_queue[.]yaml$' . > "$queue_tests" || fail 'upstream valid queue regression failed'
  go test -p=1 -mod=readonly -count=1 -timeout=20s -v \
    -run '^TestLinterLintError$/^err$/^concurrency_queue$' . >> "$queue_tests" || fail 'upstream invalid queue regression failed'
  cat "$queue_tests"
  grep -Fq -- '--- PASS: TestLinterLintOK/concurrency_queue.yaml ' "$queue_tests" || fail 'valid queue regression did not run'
  grep -Fq -- '--- PASS: TestLinterLintError/err/concurrency_queue ' "$queue_tests" || fail 'invalid queue regression did not run'
  fixed_line="$(awk '/cmd.Stdin = strings.NewReader/ { print NR }' process.go)"
  [[ "$fixed_line" =~ ^[0-9]+$ ]] || fail 'upstream stdin fix is missing'
  awk -v line="$fixed_line" '
    /\/process.go:/ {
      split($1, location, ":"); split(location[2], span, ",");
      split(span[1], first, "."); split(span[2], last, ".");
      if (first[1] <= line && last[1] >= line && $3 > 0) covered = 1;
    }
    END { exit !covered }
  ' "$tool_dir/actionlint-pipe.coverage" || fail 'upstream stdin regression did not cover the fix'
  go build -p=1 -mod=readonly -trimpath -buildvcs=false \
      -ldflags "-s -w -X github.com/rhysd/actionlint.version=${ACTIONLINT_VERSION} -X github.com/rhysd/actionlint.installedFrom=verified-upstream-source-${ACTIONLINT_COMMIT}-queue-${ACTIONLINT_QUEUE_COMMIT}" \
      -o "$tool_dir/actionlint" ./cmd/actionlint
) || fail 'source-pinned actionlint build failed'

# The verified binary is cached by its own sha256. Cold: release tarball
# (three tries when the image fallback exists, so it is reached quickly), then
# the pinned image; either source must yield the pinned binary.
shellcheck_url="https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.${shellcheck_platform}.tar.xz"
if ! cache_get "$shellcheck_binary_sha256" "$tool_dir/shellcheck"; then
  shellcheck_attempts=''
  if [[ -n "$shellcheck_image" ]] && command -v docker >/dev/null 2>&1; then
    shellcheck_attempts=3
  fi
  if fetch "$shellcheck_url" "$tool_dir/shellcheck.tar.xz" "$shellcheck_attempts"; then
    sha_ok "$tool_dir/shellcheck.tar.xz" "$shellcheck_tarball_sha256" ||
      fail "sha256 mismatch: $shellcheck_url"
    tar -xJf "$tool_dir/shellcheck.tar.xz" -C "$tool_dir" --strip-components=1 \
      "shellcheck-v${SHELLCHECK_VERSION}/shellcheck"
  elif shellcheck_from_image "$tool_dir/shellcheck"; then
    echo "::warning title=actionlint toolchain::shellcheck release download failed; using the digest-pinned container image" >&2
  else
    fail "download failed: $shellcheck_url"
  fi
  sha_ok "$tool_dir/shellcheck" "$shellcheck_binary_sha256" ||
    fail 'extracted shellcheck binary sha256 mismatch'
  cache_put "$tool_dir/shellcheck" "$shellcheck_binary_sha256"
fi

download \
  "https://files.pythonhosted.org/packages/c2/2f/81d580a0fb83baeb066698975cb14a618bdbed7720678566f1b046a95fe8/pyflakes-${PYFLAKES_VERSION}-py2.py3-none-any.whl" \
  "$tool_dir/pyflakes.whl" "$PYFLAKES_WHEEL_SHA256"
command -v python3 >/dev/null || fail 'python3 is required to run pyflakes'
printf '#!/bin/sh\nPYTHONPATH=%q exec python3 -m pyflakes "$@"\n' "$tool_dir/pyflakes.whl" \
  >"$tool_dir/pyflakes"
chmod +x "$tool_dir/actionlint" "$tool_dir/shellcheck" "$tool_dir/pyflakes"

actionlint_version="$("$tool_dir/actionlint" -version | head -n 1)"
[[ "$actionlint_version" == "$ACTIONLINT_VERSION" ]] ||
  fail "unexpected actionlint version: $actionlint_version"
"$tool_dir/shellcheck" --version | grep -qx "version: ${SHELLCHECK_VERSION}" ||
  fail 'unexpected shellcheck version'
[[ "$("$tool_dir/pyflakes" --version | awk '{print $1}')" == "$PYFLAKES_VERSION" ]] ||
  fail 'unexpected pyflakes version'

echo "actionlint ${ACTIONLINT_VERSION} / shellcheck ${SHELLCHECK_VERSION} / pyflakes ${PYFLAKES_VERSION} (sha256-verified)"
"$tool_dir/actionlint" \
  -shellcheck="$tool_dir/shellcheck" \
  -pyflakes="$tool_dir/pyflakes" \
  "$@"
