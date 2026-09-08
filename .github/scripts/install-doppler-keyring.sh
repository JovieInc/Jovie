#!/usr/bin/env bash

set -euo pipefail

key_url="${1:-}"
expected_fingerprint="${2:-}"
keyring_path="${3:-}"

if [[ ! "$key_url" =~ ^https:// ]] ||
  [[ ! "$expected_fingerprint" =~ ^[0-9A-F]{40}$ ]] ||
  [ -z "$keyring_path" ]; then
  echo "Usage: $0 <https-key-url> <40-character-primary-fingerprint> <keyring-path>" >&2
  exit 64
fi

keyring_dir="$(dirname "$keyring_path")"
stage_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/doppler-keyring.XXXXXX")"
armored_key="$stage_dir/doppler.asc"
candidate_keyring="$stage_dir/doppler.gpg"
destination_candidate=''

verify_single_primary() {
  local key_path="$1"
  local description="$2"
  local inspection
  local fingerprint

  if ! inspection="$(gpg --batch --show-keys --with-colons "$key_path" 2>/dev/null)"; then
    echo "Doppler $description is not a valid OpenPGP keyring." >&2
    return 1
  fi

  if ! fingerprint="$(printf '%s\n' "$inspection" | awk -F: '
    function valid_fingerprint(value) {
      return value ~ /^[0-9A-F]{40}$/
    }
    $1 == "pub" {
      if (waiting_for_fingerprint) malformed = 1
      primary_count += 1
      waiting_for_fingerprint = 1
      next
    }
    $1 == "sub" {
      if (waiting_for_fingerprint) malformed = 1
      waiting_for_fingerprint = 0
      next
    }
    $1 == "fpr" && waiting_for_fingerprint {
      primary_fingerprint_count += 1
      fingerprint = $10
      if (!valid_fingerprint(fingerprint)) malformed = 1
      waiting_for_fingerprint = 0
      next
    }
    END {
      if (waiting_for_fingerprint || malformed || primary_count != 1 || primary_fingerprint_count != 1) exit 1
      print fingerprint
    }
  ')"; then
    echo "Doppler $description must contain exactly one well-formed primary key." >&2
    return 1
  fi

  if [ "$fingerprint" != "$expected_fingerprint" ]; then
    echo "Doppler $description fingerprint validation failed." >&2
    return 1
  fi
}

cleanup() {
  rm -rf -- "$stage_dir"
  if [ -n "$destination_candidate" ]; then
    if [ -w "$keyring_dir" ]; then
      rm -f -- "$destination_candidate"
    else
      sudo rm -f -- "$destination_candidate"
    fi
  fi
}
trap cleanup EXIT

curl \
  --fail \
  --silent \
  --show-error \
  --location \
  --retry 5 \
  --retry-all-errors \
  --connect-timeout 10 \
  --max-time 60 \
  --tlsv1.2 \
  --proto '=https' \
  --output "$armored_key" \
  "$key_url"

test -s "$armored_key" || {
  echo "Doppler signing-key download was empty." >&2
  exit 1
}

verify_single_primary "$armored_key" 'signing-key download'

gpg --batch --yes --dearmor --output "$candidate_keyring" "$armored_key"
test -s "$candidate_keyring" || {
  echo "Doppler signing-key dearmor produced an empty keyring." >&2
  exit 1
}

verify_single_primary "$candidate_keyring" 'dearmored keyring'

if [ -w "$keyring_dir" ]; then
  destination_candidate="$(mktemp "$keyring_dir/.doppler-archive-keyring.XXXXXX")"
  install -m 0644 "$candidate_keyring" "$destination_candidate"
  mv -f -- "$destination_candidate" "$keyring_path"
else
  destination_candidate="$(sudo mktemp "$keyring_dir/.doppler-archive-keyring.XXXXXX")"
  sudo install -m 0644 "$candidate_keyring" "$destination_candidate"
  sudo mv -f -- "$destination_candidate" "$keyring_path"
fi

destination_candidate=''
