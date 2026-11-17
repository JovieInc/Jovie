#!/usr/bin/env bash
# Fetch one pinned GitHub release asset to a file, failing closed.
#   github-release-asset.sh https://github.com/<owner>/<repo>/releases/download/<tag>/<asset> <out>
# Anonymous release downloads answered HTTP 504 for hours on 2026-11-08. Each
# attempt tries anonymous curl (--output truncates, so a retry never appends),
# then, with RELEASE_DOWNLOAD_TOKEN/GH_TOKEN/GITHUB_TOKEN set, the same asset
# via the authenticated releases API. Six attempts, doubling jittered backoff
# (62-124s), then exit 1. Callers keep and check their own sha256 pins.
# api-budget: github-actions-token 120/hr - zero while anonymous downloads work; in an outage two REST reads (release by tag, asset) per failed attempt, at most 12 per calling step, ~10 failing steps an hour
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
