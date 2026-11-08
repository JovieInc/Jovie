#!/usr/bin/env bash
# Fetch one pinned GitHub release asset to a file, failing closed.
#
#   github-release-asset.sh https://github.com/<owner>/<repo>/releases/download/<tag>/<asset> <out>
#
# On 2026-11-08 anonymous github.com release downloads answered HTTP 504 for
# hours, from Actions runners and elsewhere, and red-lined every merge group
# (gitleaks, trufflehog, shellcheck, squawk, oasdiff). Each attempt here:
#   1. anonymous curl to <out> (--output truncates on every try, so a retried
#      transfer can never append to a partial body), then
#   2. when a token is set (RELEASE_DOWNLOAD_TOKEN, else GH_TOKEN, else
#      GITHUB_TOKEN), the identical asset through the authenticated releases
#      API via the shared gh client (packages/api-client). Healthy runs never
#      spend the shared token bucket; only a failed anonymous attempt does.
# Six attempts with doubling, jittered backoff (2-4 ... 32-64s, 62-124s in
# total), then exit 1 with a classified error. This verifies nothing itself:
# every caller keeps its own sha256 pins and checks the bytes afterwards.
set -euo pipefail

url="${1:-}"
out="${2:-}"
pattern='^https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/releases/download/([^/]+)/([^/]+)$'
if [[ ! "$url" =~ $pattern || -z "$out" ]]; then
  echo "::error title=Release download refused::not a pinned GitHub release asset URL: $url" >&2
  exit 2
fi
repo="${BASH_REMATCH[1]}"
tag="${BASH_REMATCH[2]}"
asset="${BASH_REMATCH[3]}"
if [[ "$tag" == .* || "$asset" == .* ]]; then
  echo "::error title=Release download refused::not a pinned GitHub release asset URL: $url" >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
token="${RELEASE_DOWNLOAD_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
attempts="${RELEASE_DOWNLOAD_ATTEMPTS:-6}"
delay="${RELEASE_DOWNLOAD_RETRY_DELAY:-2}"
status='none'

for ((attempt = 1; attempt <= attempts; attempt++)); do
  rm -f "$out"
  # The write-out names the HTTP status and the host that answered it.
  if status="$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 20 --speed-limit 1024 --speed-time 30 --output "$out" \
    --write-out '%{http_code}' "$url")"; then
    exit 0
  fi
  echo "release download: anonymous HTTP ${status:-000} for $url" >&2
  if [[ -n "$token" ]] && command -v node >/dev/null 2>&1 \
    && GH_TOKEN="$token" node "$root/packages/api-client/cli.ts" gh --priority default -- \
      release download "$tag" -R "$repo" -p "$asset" -O "$out" --clobber; then
    echo "release download: fetched $asset through the authenticated releases API" >&2
    exit 0
  fi
  if ((attempt < attempts)); then
    echo "release download attempt $attempt failed; retrying" >&2
    sleep "$((delay + RANDOM % (delay + 1)))"
    delay=$((delay * 2))
  fi
done
rm -f "$out"
echo "release download failed after $attempts attempts (last HTTP ${status:-000}): $url" >&2
exit 1
