#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ICON_PATH="$IOS_DIR/Jovie/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024@1x.png"

if [[ ! -f "$ICON_PATH" ]]; then
  echo "Missing required 1024px App Store icon: $ICON_PATH"
  exit 1
fi

WIDTH="$(sips -g pixelWidth "$ICON_PATH" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
HEIGHT="$(sips -g pixelHeight "$ICON_PATH" 2>/dev/null | awk '/pixelHeight/ {print $2}')"
HAS_ALPHA="$(sips -g hasAlpha "$ICON_PATH" 2>/dev/null | awk '/hasAlpha/ {print $2}')"

if [[ "$WIDTH" != "1024" || "$HEIGHT" != "1024" ]]; then
  echo "App Store icon must be 1024x1024. Found ${WIDTH}x${HEIGHT}."
  exit 1
fi

if [[ "$HAS_ALPHA" == "yes" ]]; then
  echo "App Store icon must be opaque and cannot contain an alpha channel."
  exit 1
fi

echo "Validated App Store icon: ${WIDTH}x${HEIGHT}"
