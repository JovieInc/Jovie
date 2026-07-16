#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_MAX_RUNNERS=10
readonly EXPECTED_UNGUARDED_CONTROLLER_SHA256=d41f50b6f5b1b969d1612b2e16e8b52c2a440a110b2f17c84841f609c1e3336b
readonly EXPECTED_V1_CONTROLLER_SHA256=7066f36e1fd5943ad2659989e4edaf2bf2c6772a47a1aac1d98280159935b436
readonly EXPECTED_V2_CONTROLLER_SHA256=4cc27f4c7ab92906cd05fd18d96df60d176ddac3f0d0864f8c4b798f33c83656
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_DIR
readonly LIVE_DIR=/opt/ci-runner-autoscaler/lib

source_patch="$SOURCE_DIR/autoscaler/controller-io-pressure.patch"
source_upgrade_patch="$SOURCE_DIR/autoscaler/controller-io-pressure-v1-to-v2.patch"
source_guard="$SOURCE_DIR/autoscaler/io-pressure.ts"
live_controller="$LIVE_DIR/controller.ts"
live_guard="$LIVE_DIR/io-pressure.ts"

if [[ "${1:-}" != "--apply" ]]; then
  echo "Dry run: no host state changed."
  echo "Would install the reviewed I/O admission guard into $LIVE_DIR"
  echo "Would preserve max runners at $EXPECTED_MAX_RUNNERS"
  echo "Would not restart the autoscaler or touch runner containers"
  exit 0
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: --apply must run as root" >&2
  exit 2
fi

service_environment="$(
  systemctl show ci-runner-autoscaler.service --property Environment --value
)"
if ! grep -Eq \
  "(^| )AUTOSCALER_MAX_RUNNERS=$EXPECTED_MAX_RUNNERS( |$)" \
  <<< "$service_environment"; then
  echo "ERROR: live service must keep max runners at $EXPECTED_MAX_RUNNERS" >&2
  exit 3
fi

live_sha="$(sha256sum "$live_controller" | awk '{print $1}')"
if [[ "$live_sha" == "$EXPECTED_V2_CONTROLLER_SHA256" ]] && \
  cmp -s "$source_guard" "$live_guard"; then
  echo "I/O admission guard and one-runner spawn budget are already installed; no host state changed."
  exit 0
fi

patched_controller="$(mktemp)"
trap 'rm -f "$patched_controller"' EXIT
cp "$live_controller" "$patched_controller"
case "$live_sha" in
  "$EXPECTED_UNGUARDED_CONTROLLER_SHA256")
    patch --silent "$patched_controller" "$source_patch"
    ;;
  "$EXPECTED_V1_CONTROLLER_SHA256")
    patch --silent "$patched_controller" "$source_upgrade_patch"
    ;;
  "$EXPECTED_V2_CONTROLLER_SHA256")
    # Recover a partial prior install by restoring the reviewed helper source.
    ;;
  *)
    echo "ERROR: live controller drifted: sha256=$live_sha" >&2
    echo "Expected reviewed unguarded $EXPECTED_UNGUARDED_CONTROLLER_SHA256 or v1 $EXPECTED_V1_CONTROLLER_SHA256" >&2
    exit 4
    ;;
esac

patched_sha="$(sha256sum "$patched_controller" | awk '{print $1}')"
if [[ "$patched_sha" != "$EXPECTED_V2_CONTROLLER_SHA256" ]]; then
  echo "ERROR: patched controller hash mismatch: sha256=$patched_sha" >&2
  echo "Expected reviewed v2 $EXPECTED_V2_CONTROLLER_SHA256" >&2
  exit 5
fi

install -o timwhite -g timwhite -m 0600 "$source_guard" "$live_guard"
install -o timwhite -g timwhite -m 0600 "$patched_controller" "$live_controller"

echo "Installed I/O admission source and one-runner spawn budget with max runners unchanged at $EXPECTED_MAX_RUNNERS."
echo "Autoscaler was not restarted; no runner containers were stopped or removed."
echo "Primary review must authorize a separate autoscaler restart to activate the guard."
