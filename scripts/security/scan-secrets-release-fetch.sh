#!/usr/bin/env bash
# Sourced by scan-secrets.sh. Curl 35 retries in place (JOV-6809). An HTTP 504
# from the release download URL falls back to the asset URL returned by the
# release metadata call. The shared gh client decodes stdout as text, so the
# gzip itself is fetched with curl from that returned URL.
# api-budget: github-actions-token 30/hr - release metadata when the scanner CDN returns HTTP 504
# boundary: binary release assets cannot ride the text gh client

if [[ -z "${REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

release_metadata() {
  local endpoint="$1"
  node "$REPO_ROOT/packages/api-client/cli.ts" gh --priority repair -- api "$endpoint"
}

fetch_release_asset_via_api() {
  local url="$1" dest="$2"
  local owner repo tag name meta asset_url token
  local -a headers
  [[ "$url" =~ ^https://github.com/([^/]+)/([^/]+)/releases/download/v([^/]+)/([^/?]+)$ ]] || return 1
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
  tag="${BASH_REMATCH[3]}"
  name="${BASH_REMATCH[4]}"
  meta="$(release_metadata "repos/${owner}/${repo}/releases/tags/v${tag}")" || return 1
  asset_url="$(jq -er --arg name "$name" '.assets[] | select(.name == $name) | .url' <<<"$meta")" || return 1
  [[ "$asset_url" == https://* ]] || return 1
  headers=(-H "Accept: application/octet-stream")
  token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [[ -n "$token" ]]; then
    headers+=(-H "Authorization: Bearer ${token}")
  fi
  curl -sSfL "${headers[@]}" -o "$dest" "$asset_url"
}

fetch_release_tarball() {
  local url="$1" dest_dir="$2" member="$3"
  local tmp attempt status
  tmp="$(mktemp)"
  for attempt in 1 2 3; do
    status=0
    curl -sSfL -o "$tmp" "$url" || status=$?
    if [[ $status -eq 0 ]] && tar -xzf "$tmp" -C "$dest_dir" "$member"; then
      chmod +x "$dest_dir/$member"
      rm -f "$tmp"
      return 0
    fi
    # 22 is curl -f on an HTTP error, including the release CDN 504.
    if [[ $status -eq 22 ]] && fetch_release_asset_via_api "$url" "$tmp" \
      && tar -xzf "$tmp" -C "$dest_dir" "$member"; then
      chmod +x "$dest_dir/$member"
      rm -f "$tmp"
      return 0
    fi
    if [[ $attempt -lt 3 ]]; then
      echo "scanner download attempt $attempt failed; retrying" >&2
      sleep "${SCAN_SECRETS_RETRY_DELAY:-2}"
    fi
  done
  rm -f "$tmp"
  echo "::error title=Secret scanner download failed::Could not fetch $member after 3 attempts ($url)." >&2
  return 1
}
