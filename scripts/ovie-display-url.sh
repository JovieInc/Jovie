#!/usr/bin/env bash
# Prints the one-shot URL that signs this Mac's browser into the Ovie office
# display (read-only Home, Full Screen). Run on the display Mac; the device
# secret never leaves the keychain. The proof rides the URL fragment, which
# browsers never send to a server and the connect page strips immediately.
#   ovie-display-url.sh [device-id] [origin]
# Provision (Tim, once):  security add-generic-password -s ovie-display-<id> -a "$USER" -w "<secret>"
set -euo pipefail
device="${1:-air-office}"
origin="${2:-https://ovie.jov.ie}"
secret="$(security find-generic-password -s "ovie-display-${device}" -w)"
ts="$(date +%s)"
proof="$(printf 'ovie-display:v1:%s:%s' "$device" "$ts" | openssl dgst -sha256 -hmac "$secret" -hex | sed 's/^.* //')"
printf '%s/display/connect#%s.%s.%s\n' "$origin" "$device" "$ts" "$proof"
