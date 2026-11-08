# shellcheck shell=bash
# Pinned scanner release download, sourced by scan-secrets.sh.
#
# Release downloads hit connection resets (curl 35, JOV-6809) and runs of
# HTTP 504 (2026-11-08: #24269, #24488, #24567). Fetch to a temp file so a
# restarted transfer never feeds tar a concatenated body, abort stalls, and
# back off with jitter: 6 attempts wait 62-124s, then fail closed.
#
# When anonymous github.com fails and CI passes SCANNER_RELEASE_TOKEN (the
# job's read-only github.token), the same attempt retries the identical
# pinned asset through the authenticated releases API with `gh release
# download`. Healthy runs never spend the shared token bucket. The token is
# a dedicated name so it never reaches other tools that read GH_TOKEN.
SCAN_SECRETS_RETRY_DELAY="${SCAN_SECRETS_RETRY_DELAY:-2}"
SCAN_SECRETS_DOWNLOAD_ATTEMPTS="${SCAN_SECRETS_DOWNLOAD_ATTEMPTS:-6}"

# https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>
fetch_release_tarball_authenticated() {
  local url="$1" out="$2" path rest
  [[ -n "${SCANNER_RELEASE_TOKEN:-}" ]] && command -v gh >/dev/null 2>&1 \
    || return 1
  path="${url#https://github.com/}"
  rest="${path#*/releases/download/}"
  GH_TOKEN="$SCANNER_RELEASE_TOKEN" gh release download "${rest%%/*}" \
    -R "${path%%/releases/download/*}" -p "${rest#*/}" -O "$out" --clobber
}

fetch_release_tarball() {
  local url="$1" dest_dir="$2" member="$3" tmp attempt delay="$SCAN_SECRETS_RETRY_DELAY"
  tmp="$(mktemp)"
  for ((attempt = 1; attempt <= SCAN_SECRETS_DOWNLOAD_ATTEMPTS; attempt++)); do
    # The write-out names the host that answered, so a 5xx log shows which hop failed.
    if { curl -sSfL --connect-timeout 20 --speed-limit 1024 --speed-time 30 -o "$tmp" \
      -w '%{stderr}scanner download: HTTP %{http_code} from %{url_effective}\n' "$url" \
      || fetch_release_tarball_authenticated "$url" "$tmp"; } \
      && tar -xzf "$tmp" -C "$dest_dir" "$member"; then
      chmod +x "$dest_dir/$member"
      rm -f "$tmp"
      return 0
    fi
    if [[ $attempt -lt $SCAN_SECRETS_DOWNLOAD_ATTEMPTS ]]; then
      echo "scanner download attempt $attempt failed; retrying" >&2
      sleep "$((delay + RANDOM % (delay + 1)))"
      delay=$((delay * 2))
    fi
  done
  rm -f "$tmp"
  echo "::error title=Secret scanner download failed::Could not fetch $member after $SCAN_SECRETS_DOWNLOAD_ATTEMPTS attempts ($url)." >&2
  return 1
}
