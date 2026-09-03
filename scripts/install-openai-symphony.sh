#!/usr/bin/env bash
set -euo pipefail

readonly SYMPHONY_VERSION="v0.0.2-jovie.2"
readonly SYMPHONY_ASSET="symphony-${SYMPHONY_VERSION}-macos_arm64"
readonly SYMPHONY_RELEASE_URL="https://github.com/JovieInc/symphony/releases/download/${SYMPHONY_VERSION}"
readonly SYMPHONY_INSTALL_DIR="${1:-$HOME/.local/bin}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  printf 'openai/symphony %s requires macOS arm64\n' "$SYMPHONY_VERSION" >&2
  exit 2
fi

SYMPHONY_TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$SYMPHONY_TEMP_DIR"' EXIT

curl --fail --location --silent --show-error \
  "$SYMPHONY_RELEASE_URL/$SYMPHONY_ASSET" \
  --output "$SYMPHONY_TEMP_DIR/$SYMPHONY_ASSET"
curl --fail --location --silent --show-error \
  "$SYMPHONY_RELEASE_URL/$SYMPHONY_ASSET.sha256" \
  --output "$SYMPHONY_TEMP_DIR/$SYMPHONY_ASSET.sha256"

(
  cd "$SYMPHONY_TEMP_DIR"
  shasum -a 256 -c "$SYMPHONY_ASSET.sha256"
)

mkdir -p "$SYMPHONY_INSTALL_DIR"
install -m 0755 \
  "$SYMPHONY_TEMP_DIR/$SYMPHONY_ASSET" \
  "$SYMPHONY_INSTALL_DIR/symphony"

printf 'Installed openai/symphony %s at %s/symphony\n' \
  "$SYMPHONY_VERSION" "$SYMPHONY_INSTALL_DIR"
