#!/usr/bin/env bash
# Contract test for fetch-scanner.sh (JOV-11689): release 504 -> verified
# container-image fallback; checksum mismatch and total outage fail closed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
BIN="$ROOT/bin"; mkdir -p "$BIN"
export SCAN_SECRETS_RETRY_DELAY=0
# No authenticated release fallback: the stubs below are the only sources.
export RELEASE_DOWNLOAD_TOKEN= GH_TOKEN= GITHUB_TOKEN=

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

printf '#!/bin/sh\necho good\n' >"$ROOT/good-bin"
printf '#!/bin/sh\necho evil\n' >"$ROOT/evil-bin"
GOOD="$(sha "$ROOT/good-bin")"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$(uname -m)" in aarch64 | arm64) arch=arm64 ;; *) arch=amd64 ;; esac
write_pins() { printf 'trufflehog 9.9.9 %s/%s %s\n' "$os" "$arch" "$1" >"$ROOT/pins.txt"; }

# curl always 504s (counts calls); docker serves $DOCKER_PAYLOAD.
cat >"$BIN/curl" <<'SH'
#!/usr/bin/env bash
echo x >>"$CURL_CALLS"
[[ "${CURL_MODE:-504}" == 504 ]] && { echo "curl: (22) The requested URL returned error: 504" >&2; exit 22; }
# CURL_MODE=tarball: serve a tarball containing the payload as trufflehog
out=""; while [[ $# -gt 0 ]]; do [[ "$1" == -o || "$1" == --output ]] && out="$2"; shift; done
d="$(mktemp -d)"; cp "$DOCKER_PAYLOAD" "$d/trufflehog"; tar -czf "$out" -C "$d" trufflehog
SH
cat >"$BIN/docker" <<'SH'
#!/usr/bin/env bash
echo "$*" >>"$DOCKER_CALLS"
case "$1" in
  pull) [[ "${DOCKER_MODE:-ok}" == down ]] && exit 1; exit 0 ;;
  create) echo cid123 ;;
  cp) cp "$DOCKER_PAYLOAD" "$3" ;;
  rm) ;;
esac
SH
chmod +x "$BIN/curl" "$BIN/docker"

run() { # name -> sets RC, OUT
  export CURL_CALLS="$ROOT/curl.calls" DOCKER_CALLS="$ROOT/docker.calls" PATH="$BIN:$PATH"
  : >"$CURL_CALLS"; : >"$DOCKER_CALLS"
  export TMPDIR="$ROOT/tmp-$1"; mkdir -p "$TMPDIR"
  export SCANNER_PINS_FILE="$ROOT/pins.txt"
  RC=0; OUT="$("$HERE/fetch-scanner.sh" trufflehog 9.9.9 2>"$ROOT/err-$1")" || RC=$?
}
fail() { echo "FAIL: $*" >&2; cat "$ROOT"/err-* >&2 || true; exit 1; }

# 1. release 504 -> image fallback used and verified
write_pins "$GOOD"
DOCKER_PAYLOAD="$ROOT/good-bin" CURL_MODE=504 run fallback
[[ $RC -eq 0 ]] || fail "fallback should succeed (rc=$RC)"
[[ "$(sha "$OUT")" == "$GOOD" ]] || fail "fallback binary not the verified one"
[[ "$(wc -l <"$CURL_CALLS")" -eq 3 ]] || fail "expected 3 release attempts"
grep -q '^create' "$DOCKER_CALLS" || fail "docker fallback not used"

# 2. warm cache: no network at all
export TMPDIR="$ROOT/tmp-fallback"
: >"$CURL_CALLS"; : >"$DOCKER_CALLS"
OUT2="$(PATH="$BIN:$PATH" CURL_CALLS="$CURL_CALLS" DOCKER_CALLS="$DOCKER_CALLS" SCANNER_PINS_FILE="$ROOT/pins.txt" "$HERE/fetch-scanner.sh" trufflehog 9.9.9 2>/dev/null)"
[[ "$OUT2" == "$OUT" && ! -s "$CURL_CALLS" && ! -s "$DOCKER_CALLS" ]] || fail "warm cache touched the network"

# 3. release works -> no docker
DOCKER_PAYLOAD="$ROOT/good-bin" CURL_MODE=tarball run release
[[ $RC -eq 0 && ! -s "$DOCKER_CALLS" ]] || fail "release path should not need docker"

# 4. NEGATIVE: fallback image serves a binary with the wrong checksum -> fail
DOCKER_PAYLOAD="$ROOT/evil-bin" CURL_MODE=504 run mismatch
[[ $RC -ne 0 ]] || fail "checksum mismatch must fail"
[[ ! -e "$TMPDIR/trufflehog-9.9.9/trufflehog" ]] || fail "unverified binary was installed"
grep -q 'checksum mismatch' "$ROOT/err-mismatch" || fail "mismatch not reported"

# 5. tampered cache is discarded and replaced by a verified binary
mkdir -p "$ROOT/tmp-tamper/trufflehog-9.9.9"; cp "$ROOT/evil-bin" "$ROOT/tmp-tamper/trufflehog-9.9.9/trufflehog"; chmod +x "$ROOT/tmp-tamper/trufflehog-9.9.9/trufflehog"
DOCKER_PAYLOAD="$ROOT/good-bin" CURL_MODE=504 run tamper
[[ $RC -eq 0 && "$(sha "$OUT")" == "$GOOD" ]] || fail "tampered cache must be replaced by a verified binary"
mkdir -p "$ROOT/tmp-tamper2/trufflehog-9.9.9"; cp "$ROOT/evil-bin" "$ROOT/tmp-tamper2/trufflehog-9.9.9/trufflehog"; chmod +x "$ROOT/tmp-tamper2/trufflehog-9.9.9/trufflehog"
DOCKER_MODE=down DOCKER_PAYLOAD="$ROOT/good-bin" CURL_MODE=504 run tamper2
[[ $RC -ne 0 ]] || fail "tampered cache with no other source must fail"

# 6. NEGATIVE: all sources down -> hard failure
DOCKER_MODE=down DOCKER_PAYLOAD="$ROOT/good-bin" CURL_MODE=504 run outage
[[ $RC -ne 0 ]] || fail "total outage must fail, not pass"

# 7. NEGATIVE: unpinned platform fails closed
printf '# empty\n' >"$ROOT/pins.txt"
DOCKER_PAYLOAD="$ROOT/good-bin" CURL_MODE=504 run unpinned
[[ $RC -ne 0 ]] || fail "unpinned tool must fail closed"

echo "fetch-scanner.test.sh: ok"
