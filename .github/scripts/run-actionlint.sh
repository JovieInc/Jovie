#!/usr/bin/env bash
# Run actionlint v1.7.12 from checksum-pinned release artifacts.
#
# Replaces the rhysd/actionlint Docker action, whose image the runner rebuilt
# at every job start (~26-33s) even when the step was skipped. The toolchain
# matches that image exactly:
#   - actionlint v1.7.12: the release binary built from the same tag commit
#     (914e7df21a07ef503a81201c76d2b11c789d3fca) the Docker action pinned.
#     The tarball sha256 matches upstream actionlint_1.7.12_checksums.txt.
#   - shellcheck v0.11.0: the image copied /bin/shellcheck from
#     koalaman/shellcheck-alpine:stable (sha256:c82fe425...9183 in CI logs).
#     That binary is byte-identical (sha256 below) to the upstream release
#     tarball's binary, which is pinned here too.
#   - pyflakes 3.4.0: the image's apk py3-pyflakes version, pinned by wheel
#     hash and run from the zip with the runner's python3.
# Tools are passed by absolute path, so the runner's preinstalled shellcheck
# is never used. Any download, checksum, platform, or version mismatch fails
# closed before linting. Arguments are forwarded to actionlint.
set -euo pipefail

readonly ACTIONLINT_VERSION='1.7.12'
readonly ACTIONLINT_SHA256='8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'
readonly SHELLCHECK_VERSION='0.11.0'
readonly SHELLCHECK_TARBALL_SHA256='8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198'
readonly SHELLCHECK_BINARY_SHA256='4da528ddb3a4d1b7b24a59d4e16eb2f5fd960f4bd9a3708a15baddbdf1d5a55b'
readonly PYFLAKES_VERSION='3.4.0'
readonly PYFLAKES_WHEEL_SHA256='f742a7dbd0d9cb9ea41e9a24a918996e8170c799fa528688d40dd582c8265f4f'

fail() {
  echo "::error title=actionlint toolchain::$*" >&2
  exit 1
}

if [[ "$(uname -s)" != 'Linux' || "$(uname -m)" != 'x86_64' ]]; then
  fail "pinned toolchain supports Linux x86_64 only (got $(uname -s) $(uname -m))"
fi

tool_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/actionlint-toolchain.XXXXXX")"
trap 'rm -rf "$tool_dir"' EXIT

download() {
  local url="$1" out="$2" sha="$3"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --retry 3 --retry-all-errors --max-time 120 --output "$out" "$url" ||
    fail "download failed: $url"
  printf '%s  %s\n' "$sha" "$out" | sha256sum --check --status ||
    fail "sha256 mismatch: $url"
}

download \
  "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" \
  "$tool_dir/actionlint.tar.gz" "$ACTIONLINT_SHA256"
tar -xzf "$tool_dir/actionlint.tar.gz" -C "$tool_dir" actionlint

download \
  "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.linux.x86_64.tar.xz" \
  "$tool_dir/shellcheck.tar.xz" "$SHELLCHECK_TARBALL_SHA256"
tar -xJf "$tool_dir/shellcheck.tar.xz" -C "$tool_dir" --strip-components=1 \
  "shellcheck-v${SHELLCHECK_VERSION}/shellcheck"
printf '%s  %s\n' "$SHELLCHECK_BINARY_SHA256" "$tool_dir/shellcheck" |
  sha256sum --check --status || fail 'extracted shellcheck binary sha256 mismatch'

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
