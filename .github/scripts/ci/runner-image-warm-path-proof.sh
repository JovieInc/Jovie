#!/usr/bin/env bash
set -euo pipefail
assert_equal() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf '::error title=Runner image canary::%s: expected %q, got %q\n' \
      "$name" "$expected" "$actual"
    return 1
  fi
}
assert_line() {
  local name="$1" expected="$2" actual="$3"
  if ! grep -Fqx -- "$expected" <<< "$actual"; then
    printf '::error title=Runner image canary::%s: missing line %q; output was %q\n' \
      "$name" "$expected" "$actual"
    return 1
  fi
}
assert_executable() {
  local name="$1" path="$2"
  if [[ ! -x "$path" ]]; then
    printf '::error title=Runner image canary::%s: not executable at %s\n' \
      "$name" "$path"
    return 1
  fi
}

# The verifier normally writes machine-readable fields to the
# Actions-provided GITHUB_OUTPUT file. This assertion step needs those
# fields on stdout so command substitution can inspect them.
dependency_status=$(env -u GITHUB_OUTPUT node .github/runner-image/verify-prerequisites.mjs --component dependencies)
playwright_status=$(env -u GITHUB_OUTPUT node .github/runner-image/verify-prerequisites.mjs --component playwright)
assert_line 'dependency warm status' 'dependencies_warm=true' "$dependency_status"
assert_line 'pnpm store path' 'pnpm_store_path=/opt/jovie-pnpm-store' "$dependency_status"
assert_line 'Playwright warm status' 'playwright_warm=true' "$playwright_status"
assert_line 'Playwright browser path' 'playwright_browsers_path=/opt/ms-playwright' "$playwright_status"
assert_equal 'Node version' v24.22.3 "$(node --version)"
assert_equal 'pnpm version' 9.15.9 "$(pnpm --version)"
assert_equal 'PLAYWRIGHT_BROWSERS_PATH' /opt/ms-playwright "$PLAYWRIGHT_BROWSERS_PATH"
assert_executable 'Chromium' /opt/ms-playwright/chromium-1223/chrome-linux64/chrome
assert_executable 'Chromium headless shell' /opt/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell
assert_executable 'FFmpeg' /opt/ms-playwright/ffmpeg-1011/ffmpeg-linux
