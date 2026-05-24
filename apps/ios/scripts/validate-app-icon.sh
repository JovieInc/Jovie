#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/../.." && pwd)"
ICON_PATH="$IOS_DIR/Jovie/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024@1x.png"
APP_ICON_DIR="$IOS_DIR/Jovie/Resources/Assets.xcassets/AppIcon.appiconset"
CONTENTS_JSON="$APP_ICON_DIR/Contents.json"

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

while IFS=$'\t' read -r filename expected_size; do
  [[ -n "$filename" ]] || continue
  path="$APP_ICON_DIR/$filename"
  if [[ ! -f "$path" ]]; then
    echo "Missing app icon declared in Contents.json: $filename"
    exit 1
  fi

  width="$(sips -g pixelWidth "$path" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
  height="$(sips -g pixelHeight "$path" 2>/dev/null | awk '/pixelHeight/ {print $2}')"
  has_alpha="$(sips -g hasAlpha "$path" 2>/dev/null | awk '/hasAlpha/ {print $2}')"

  if [[ "$width" != "$expected_size" || "$height" != "$expected_size" ]]; then
    echo "$filename must be ${expected_size}x${expected_size}. Found ${width}x${height}."
    exit 1
  fi

  if [[ "$has_alpha" == "yes" ]]; then
    echo "$filename must be opaque and cannot contain an alpha channel."
    exit 1
  fi
done < <(
  node --input-type=module - "$CONTENTS_JSON" <<'NODE'
import fs from 'node:fs';

const contents = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const image of contents.images) {
  if (!image.filename || !image.size || !image.scale) continue;
  const logical = Number.parseFloat(String(image.size).split('x')[0]);
  const scale = Number.parseInt(String(image.scale).replace('x', ''), 10);
  console.log(`${image.filename}\t${Math.round(logical * scale)}`);
}
NODE
)

swift - "$ICON_PATH" <<'SWIFT'
import AppKit
import Foundation

let iconPath = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: iconPath),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff)
else {
  fputs("Unable to read App Store icon pixels.\n", stderr)
  exit(1)
}

func sample(_ x: Int, _ y: Int) -> (Int, Int, Int)? {
  guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else {
    return nil
  }

  return (
    Int((color.redComponent * 255).rounded()),
    Int((color.greenComponent * 255).rounded()),
    Int((color.blueComponent * 255).rounded())
  )
}

let corners = [
  (0, 0),
  (bitmap.pixelsWide - 1, 0),
  (0, bitmap.pixelsHigh - 1),
  (bitmap.pixelsWide - 1, bitmap.pixelsHigh - 1),
]

for (x, y) in corners {
  guard let (red, green, blue) = sample(x, y) else {
    fputs("Unable to read App Store icon corner at \(x),\(y).\n", stderr)
    exit(1)
  }

  if red > 10 || green > 11 || blue > 12 {
    fputs("App Store icon corners must be black; saw rgb(\(red), \(green), \(blue)).\n", stderr)
    exit(1)
  }
}
SWIFT

echo "Validated all iOS app icons from Contents.json"
