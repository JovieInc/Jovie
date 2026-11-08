#!/usr/bin/env bash
# Resilient, checksum-verified scanner binary fetch (JOV-11689).
#
# Usage (sourced): fetch_scanner <tool> <version>   -> prints verified binary path
#        (CLI):    fetch-scanner.sh <tool> <version>
#
# Order: warm cache -> GitHub release tarball (3 tries) -> container image
# (Docker Hub, then ghcr.io), none of which use the GitHub release CDN.
# EVERY source must produce a binary whose sha256 equals the pin in
# scanner-pins.txt; a mismatch or exhausted sources is a hard failure. The
# scan is never skipped and a failed fetch is never a pass.
FETCH_SCANNER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_PINS_FILE="${SCANNER_PINS_FILE:-$FETCH_SCANNER_DIR/scanner-pins.txt}"
SCAN_SECRETS_RETRY_DELAY="${SCAN_SECRETS_RETRY_DELAY:-2}"
# Release downloads hit resets (curl 35, JOV-6809) and HTTP 504 runs (#24269,
# #24488): 6 jittered, backed-off tries; a source with a verified fallback
# caps at 3 so the fallback is reached quickly.
SCAN_SECRETS_DOWNLOAD_ATTEMPTS="${SCAN_SECRETS_DOWNLOAD_ATTEMPTS:-6}"

_scanner_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

_scanner_pin() { # tool version platform
  awk -v t="$1" -v v="$2" -v p="$3" \
    '$1 !~ /^#/ && $1 == t && $2 == v && $3 == p { print $4; exit }' "$SCANNER_PINS_FILE"
}

_scanner_verify() { # file expected tool
  local actual
  actual="$(_scanner_sha256 "$1")"
  if [[ "$actual" != "$2" ]]; then
    echo "::error title=Scanner checksum mismatch::$3 sha256 $actual does not match pinned $2" >&2
    return 1
  fi
}

_scanner_from_release() { # url member out [max-attempts]
  local url="$1" member="$2" out="$3" max="${4:-$SCAN_SECRETS_DOWNLOAD_ATTEMPTS}" tmp work attempt delay="$SCAN_SECRETS_RETRY_DELAY"
  tmp="$(mktemp)"
  work="$(mktemp -d)"
  for ((attempt = 1; attempt <= max; attempt++)); do
    if [[ -z "$member" ]]; then
      # Raw binary release asset (no archive).
      if curl -sSfL --connect-timeout 20 --speed-limit 1024 --speed-time 30 -o "$tmp" "$url" && [[ -s "$tmp" ]]; then
        mv "$tmp" "$out"
        rm -rf "$work"
        return 0
      fi
    elif curl -sSfL --connect-timeout 20 --speed-limit 1024 --speed-time 30 -o "$tmp" "$url" && tar -xzf "$tmp" -C "$work" "$member" \
      && [[ -f "$work/$member" ]]; then
      mv "$work/$member" "$out"
      rm -rf "$tmp" "$work"
      return 0
    fi
    [[ $attempt -lt $max ]] || break
    echo "scanner download attempt $attempt failed; retrying" >&2
    sleep "$((delay + RANDOM % (delay + 1)))"
    delay=$((delay * 2))
  done
  rm -rf "$tmp" "$work"
  return 1
}

_scanner_from_image() { # image platform path-in-image out
  local image="$1" platform="$2" inpath="$3" out="$4" cid
  command -v docker >/dev/null 2>&1 || return 1
  docker pull --quiet --platform "$platform" "$image" >/dev/null || return 1
  cid="$(docker create --platform "$platform" "$image")" || return 1
  if docker cp "$cid:$inpath" "$out"; then
    docker rm "$cid" >/dev/null 2>&1 || true
    return 0
  fi
  docker rm "$cid" >/dev/null 2>&1 || true
  return 1
}

fetch_scanner() { # tool version
  local tool="$1" version="$2" os arch rel_arch platform pin cache_dir bin cand
  local url image1 image2 inpath member="$1"
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64"; rel_arch="amd64" ;;
    aarch64 | arm64) arch="arm64"; rel_arch="arm64" ;;
  esac
  platform="$os/$arch"
  case "$tool" in
    trufflehog)
      url="https://github.com/trufflesecurity/trufflehog/releases/download/v${version}/trufflehog_${version}_${os}_${rel_arch}.tar.gz"
      image1="trufflesecurity/trufflehog:${version}"
      image2="ghcr.io/trufflesecurity/trufflehog:${version}"
      inpath=/usr/bin/trufflehog ;;
    gitleaks)
      [[ "$arch" == amd64 ]] && rel_arch=x64
      url="https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${os}_${rel_arch}.tar.gz"
      # The 8.21.2 image binary differs from the release binary, so it cannot
      # satisfy the release-derived pin: no image fallback for gitleaks.
      image1=""
      image2=""
      inpath=/usr/bin/gitleaks ;;
    osv-scanner)
      url="https://github.com/google/osv-scanner/releases/download/v${version}/osv-scanner_${os}_${rel_arch}"
      image1="ghcr.io/google/osv-scanner:v${version}"
      image2="$image1"
      inpath=/osv-scanner
      member="" ;;
    *) echo "::error::unknown scanner $tool" >&2; return 1 ;;
  esac

  pin="$(_scanner_pin "$tool" "$version" "$platform")"
  if [[ -z "$pin" ]]; then
    echo "::error title=Scanner not pinned::no sha256 pin for $tool $version $platform in $SCANNER_PINS_FILE" >&2
    return 1
  fi

  cache_dir="${TMPDIR:-/tmp}/${tool}-${version}"
  mkdir -p "$cache_dir"
  bin="$cache_dir/$tool"
  if [[ -x "$bin" ]]; then
    if _scanner_verify "$bin" "$pin" "cached $tool" 2>/dev/null; then
      printf '%s\n' "$bin"
      return 0
    fi
    echo "cached $tool failed checksum; discarding" >&2
    rm -f "$bin"
  fi

  cand="$(mktemp "$cache_dir/.cand.XXXXXX")"
  local max_attempts="$SCAN_SECRETS_DOWNLOAD_ATTEMPTS"
  if [[ -n "$image1" && $max_attempts -gt 3 ]]; then max_attempts=3; fi
  if _scanner_from_release "$url" "$member" "$cand" "$max_attempts" && _scanner_verify "$cand" "$pin" "$tool (release)"; then
    :
  else
    rm -f "$cand"; cand="$(mktemp "$cache_dir/.cand.XXXXXX")"
    echo "::warning title=Scanner release fetch failed::falling back to container image for $tool $version" >&2
    if [[ -n "$image1" ]] && { _scanner_from_image "$image1" "$platform" "$inpath" "$cand" \
         || _scanner_from_image "$image2" "$platform" "$inpath" "$cand"; } \
      && _scanner_verify "$cand" "$pin" "$tool (image)"; then
      :
    else
      rm -f "$cand"
      echo "::error title=Secret scanner download failed::Could not fetch a verified $tool $version from release ($url) or container images." >&2
      return 1
    fi
  fi
  chmod +x "$cand"
  mv "$cand" "$bin"
  printf '%s\n' "$bin"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  fetch_scanner "$@"
fi
