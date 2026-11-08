#!/usr/bin/env bash
# HTTP 504 on the release download URL must use the asset URL from metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/security/scan-secrets-release-fetch.sh
. "$ROOT/scripts/security/scan-secrets-release-fetch.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

BIN="$(mktemp -d)"
DEST="$(mktemp -d)"
trap 'rm -rf "$BIN" "$DEST"' EXIT

cat >"$BIN/curl" <<'EOF'
#!/usr/bin/env bash
count=0
[[ -f "$CURL_COUNT" ]] && count="$(cat "$CURL_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" >"$CURL_COUNT"
out=''
prev=''
for arg in "$@"; do
  [[ "$prev" == '-o' ]] && out="$arg"
  prev="$arg"
done
url="${!#}"
if [[ "$url" == *'/releases/download/'* || "${CURL_ASSET_FAIL:-}" == 1 ]]; then
  echo 'curl: (22) The requested URL returned error: 504' >&2
  exit 22
fi
printf 'fake-tarball' >"$out"
EOF
cat >"$BIN/tar" <<'EOF'
#!/usr/bin/env bash
dest=''
prev=''
for arg in "$@"; do
  [[ "$prev" == '-C' ]] && dest="$arg"
  prev="$arg"
done
printf '#!/usr/bin/env bash\nexit 0\n' >"$dest/${!#}"
EOF
chmod +x "$BIN/curl" "$BIN/tar"

release_metadata() {
  printf '%s\n' '{"assets":[{"name":"gitleaks_8.21.2_linux_x64.tar.gz","url":"https://example.invalid/scanner-asset"}]}'
}

export CURL_COUNT="$BIN/count" PATH="$BIN:/usr/bin:/bin" SCAN_SECRETS_RETRY_DELAY=0
: >"$CURL_COUNT"
fetch_release_tarball \
  'https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz' \
  "$DEST" gitleaks
[[ -x "$DEST/gitleaks" ]] || fail 'asset fallback must install the scanner'
[[ "$(cat "$CURL_COUNT")" -eq 2 ]] || fail "expected 2 curls, got $(cat "$CURL_COUNT")"

export CURL_ASSET_FAIL=1
rm -rf "$DEST"
mkdir -p "$DEST"
: >"$CURL_COUNT"
status=0
fetch_release_tarball \
  'https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz' \
  "$DEST" gitleaks || status=$?
[[ $status -ne 0 ]] || fail 'exhausted asset fallback must fail'
[[ "$(cat "$CURL_COUNT")" -eq 6 ]] || fail "expected 6 curls, got $(cat "$CURL_COUNT")"
echo 'PASS: release CDN 504 falls back to the asset url'
