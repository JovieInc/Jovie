#!/usr/bin/env bash
# JOV-13089: select one installed toolchain; never install or fall back.
set -euo pipefail

xcode_app="/Applications/Xcode_27.1.app"
if [ ! -d "$xcode_app" ]; then
  echo "::error::Required Xcode is missing at $xcode_app. This workflow's runs-on was left unchanged on purpose. No fallback or install is permitted."
  echo "Available Xcode applications:"
  shopt -s nullglob
  xcode_apps=(/Applications/Xcode*.app)
  if [ "${#xcode_apps[@]}" -gt 0 ]; then
    printf '%s\n' "${xcode_apps[@]}"
  else
    echo "(none)"
  fi
  printf 'Current DEVELOPER_DIR=%s\n' "${DEVELOPER_DIR:-<unset>}"
  echo "Current xcode-select -p:"
  xcode-select -p || true
  echo "Current xcodebuild -version:"
  xcodebuild -version || true
  exit 1
fi

export DEVELOPER_DIR="$xcode_app/Contents/Developer"
xcodebuild -version
xcodebuild -showsdks
sdk_version="$(xcrun --sdk iphoneos --show-sdk-version)"
sdk_path="$(xcrun --sdk iphoneos --show-sdk-path)"
printf 'Selected iPhone OS SDK: iphoneos%s\nPath: %s\n' "$sdk_version" "$sdk_path"
if ! [[ "$sdk_version" =~ ^27\.[0-9]+(\.[0-9]+)?$ ]]; then
  echo "::error::Xcode 27.1 must select an iPhone OS SDK in 27.x; got $sdk_version. Refusing to continue."
  exit 1
fi
printf 'DEVELOPER_DIR=%s\n' "$DEVELOPER_DIR" >> "${GITHUB_ENV:?GITHUB_ENV must be set}"
