#!/usr/bin/env bash
set -euo pipefail

# iOS best-practices guardrail lint.
#
# Flags performance / robustness anti-patterns in production SwiftUI code that
# cause jank, main-thread stalls, or crashes. Each rule maps to a fix that the
# Jovie iOS app already follows — see `.claude/rules/ios.md` for rationale.
#
# Portable by design: pass a target directory so this same script can be
# vendored into any company repo that ships iOS/SwiftUI code.
#
#   scripts/ios-best-practices-lint.sh [TARGET_DIR]
#
# Default TARGET_DIR is apps/ios/Jovie (this repo's app sources). Test targets
# are skipped automatically — tests legitimately exercise some of these APIs.

TARGET_DIR="${1:-apps/ios/Jovie}"

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "ios-best-practices-lint: target directory not found: $TARGET_DIR" >&2
  exit 2
fi

violations=0

report() {
  local file="$1" line="$2" rule="$3" message="$4"
  violations=$((violations + 1))
  echo "  ✖ ${file}:${line} [${rule}]"
  echo "      ${message}"
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "::error file=${file},line=${line}::[${rule}] ${message}"
  fi
}

# scan PATTERN RULE MESSAGE [ALLOW_PATH_REGEX]
#
# Greps production Swift for PATTERN (extended regex), skipping test files,
# comment-only lines, and any file matching ALLOW_PATH_REGEX.
scan() {
  local pattern="$1" rule="$2" message="$3" allow="${4:-}"
  local file line content
  while IFS=: read -r file line content; do
    [[ -z "${file:-}" ]] && continue
    case "$file" in
      *Tests.swift | *UITests* | */Tests/* | */*Tests/*) continue ;;
    esac
    if [[ -n "$allow" && "$file" =~ $allow ]]; then
      continue
    fi
    # Skip comment-only lines (first non-whitespace characters are `//`).
    # A line with trailing code before the `//` is still scanned.
    if [[ "$content" =~ ^[[:space:]]*// ]]; then
      continue
    fi
    report "$file" "$line" "$rule" "$message"
  done < <(grep -rnHE "$pattern" --include='*.swift' "$TARGET_DIR" 2>/dev/null || true)
}

echo "iOS best-practices lint → ${TARGET_DIR}"

# 0. Foundation APIs (URL, Date, UUID, Data, JSON*, ...) are only visible in a
#    Swift file when that file imports Foundation — directly or transitively.
#    Transitive visibility (via SwiftUI/UIKit) is toolchain-dependent and has
#    already broken a merge-queue build, so the import must be explicit. This
#    check scans the test targets (`apps/ios/JovieTests`, `JovieUITests`) that
#    the production scans below skip: a missing import there fails compilation.
#    Only files that import nothing but Testing/XCTest are flagged — UIKit /
#    SwiftUI / AVFoundation / XCTest files already get Foundation transitively
#    on every toolchain Jovie targets, and the regression this guards (a
#    Testing-only file gaining Foundation API references) can only recur in
#    that bucket.
for tests_root in "$(dirname "$TARGET_DIR")/JovieTests" "$(dirname "$TARGET_DIR")/JovieUITests"; do
  [[ -d "$tests_root" ]] || continue
  while IFS= read -r swift_file; do
    [[ -z "${swift_file:-}" ]] && continue
    grep -qE '^import (Foundation|UIKit|SwiftUI|AVFoundation|XCTest)' "$swift_file" && continue
    if grep -qE '(^|[^A-Za-z0-9_.])(URL|Data|Date|UUID|JSONDecoder|JSONEncoder|DateFormatter|TimeInterval|ProcessInfo|Bundle|Calendar|Locale)\(' "$swift_file" \
      || grep -qE '(^|[^A-Za-z0-9_.])(ProcessInfo|Calendar|Locale)\.' "$swift_file"; then
      report "$swift_file" 1 'require-explicit-foundation-import' \
        'Test file references Foundation APIs without `import Foundation`. Transitive visibility is toolchain-dependent; add the explicit import.'
    fi
  done < <(find "$tests_root" -name '*.swift' -type f | LC_ALL=C sort)
done

# 1. Raw AsyncImage drops to its placeholder on every appearance (flicker) and
#    shares no decoded-image cache across instances.
scan 'AsyncImage\(' 'no-raw-asyncimage' \
  'Raw AsyncImage re-fetches and flashes its placeholder on every appearance. Use a cached image loader (e.g. AvatarImageCache + AvatarImageLoader).'

# 2. CoreImage / CGImage generation is CPU-bound and must live in a dedicated,
#    cache-backed renderer that runs off the main actor — never in a view body.
scan '(CIContext\(|createCGImage\()' 'no-coreimage-in-views' \
  'CoreImage/CGImage rendering must live in a dedicated cache-backed *Renderer.swift and run off the main actor (Task.detached) — never inside a SwiftUI body.' \
  'Renderer\.swift$'

# 3. Anything that blocks the main thread janks the UI.
scan '(DispatchQueue\.main\.sync|Thread\.sleep|usleep\(|DispatchSemaphore|Data\(contentsOf:)' 'no-main-thread-blocking' \
  'Synchronous blocking on the main thread janks the UI. Use async/await (Task, URLSession.data, Task.sleep) instead.'

# 4. UserDefaults.synchronize() is deprecated and forces a blocking disk flush.
scan '\.synchronize\(\)' 'no-userdefaults-synchronize' \
  'UserDefaults.synchronize() is deprecated and forces a blocking disk flush. Remove it — values persist automatically.'

# 5. print() ships noise and is invisible in production telemetry.
scan '(^|[^A-Za-z0-9_.])print\(' 'no-print' \
  'print() ships noise and is invisible in production. Use the Observability layer.'

# 6. try! crashes the app on any thrown error.
scan '(^|[^A-Za-z0-9_])try!' 'no-force-try' \
  'try! crashes the whole app on any thrown error. Use try? or do/catch.'

echo ""
if [[ "$violations" -gt 0 ]]; then
  echo "iOS best-practices lint: ${violations} violation(s) found."
  exit 1
fi

echo "iOS best-practices lint: clean ✓"
