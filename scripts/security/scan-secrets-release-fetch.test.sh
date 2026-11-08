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
cat >"$BIN/node" <<'EOF'
#!/usr/bin/env bash
# Stands in for the gh client. Actions with no token matches the runner failure.
if [[ "${GITHUB_ACTIONS:-}" == true && -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo 'gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable.' >&2
  exit 1
fi
printf '%s\n' '{"assets":[{"name":"gitleaks_8.21.2_linux_x64.tar.gz","url":"https://example.invalid/scanner-asset"}]}'
EOF
chmod +x "$BIN/curl" "$BIN/tar" "$BIN/node"

unset GITHUB_ACTIONS GH_TOKEN GITHUB_TOKEN CURL_ASSET_FAIL
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

# The runner failure: metadata never reaches an asset curl without a token.
unset CURL_ASSET_FAIL GH_TOKEN GITHUB_TOKEN
export GITHUB_ACTIONS=true
rm -rf "$DEST"
mkdir -p "$DEST"
: >"$CURL_COUNT"
status=0
fetch_release_tarball \
  'https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz' \
  "$DEST" gitleaks >"$BIN/no-token.out" 2>"$BIN/no-token.err" || status=$?
[[ $status -ne 0 ]] || fail 'Actions without a token must fail'
[[ "$(cat "$CURL_COUNT")" -eq 3 ]] || fail "tokenless Actions must not curl the asset, got $(cat "$CURL_COUNT")"
grep -q 'set the GH_TOKEN environment variable' "$BIN/no-token.err" || fail 'missing the Actions token message'

# The same fallback reaches the asset curl once GH_TOKEN is set.
export GH_TOKEN=test-token
rm -rf "$DEST"
mkdir -p "$DEST"
: >"$CURL_COUNT"
fetch_release_tarball \
  'https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz' \
  "$DEST" gitleaks
[[ -x "$DEST/gitleaks" ]] || fail 'token must let the asset fallback install the scanner'
[[ "$(cat "$CURL_COUNT")" -eq 2 ]] || fail "expected 2 curls with a token, got $(cat "$CURL_COUNT")"
unset GITHUB_ACTIONS GH_TOKEN
echo 'PASS: release CDN 504 falls back to the asset url'
