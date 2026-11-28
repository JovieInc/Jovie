#!/usr/bin/env bash
set -euo pipefail
CHANGED_PATHS="$RUNNER_TEMP/product-lane-classification/changed-paths.txt"
test -f "$CHANGED_PATHS"
HOMEPAGE_VISUAL_PATTERN='^(\.github/(workflows/(ci|pr-visual-review)\.yml|scripts/(ci/[^/]+\.sh|detect-ci-path-changes\.sh|select-ci-structural-lane\.sh))|\.github/actions/setup-playwright/|\.github/scripts/guard-playwright-artifacts\.mjs|scripts/(lib/(__tests__/)?)?visual-snapshot-compare\.mjs|apps/web/app/\(home\)/|apps/web/app/(globals\.css|layout\.tsx)|apps/web/components/(homepage/|features/home/|site/(MarketingHeader|PublicPageShell|MarketingFooter|Container)\.|organisms/HeaderNav\.)|apps/web/data/homepage.*\.ts|apps/web/lib/(flags/marketing-static|screenshots/registry)|apps/web/public/product-screenshots/|apps/web/playwright\.config\.ts|apps/web/tests/e2e/(homepage|cookies|visual-regression)\.spec\.ts|apps/web/tests/e2e/__snapshots__/visual-regression\.spec\.ts/|packages/ui/)'
if grep -q -E "$HOMEPAGE_VISUAL_PATTERN" "$CHANGED_PATHS"; then
  echo "run_homepage_visual=true" >> "$GITHUB_OUTPUT"
else
  echo "run_homepage_visual=false" >> "$GITHUB_OUTPUT"
fi
MARKETING_DOM_PATTERN='^(\.github/(workflows/ci\.yml|scripts/(ci/[^/]+\.sh|detect-ci-path-changes\.sh|select-ci-structural-lane\.sh))|apps/web/app/\((marketing|home)\)/|apps/web/app/(globals\.css|layout\.tsx)|apps/web/components/(marketing|site|homepage|features/home|molecules/PhoneFrame)|apps/web/data/|apps/web/styles/|apps/web/public/(product-screenshots|device-bezels)/|apps/web/tests/e2e/utils/(route-dom-[a-z-]+|image-contrast-detector)\.ts|apps/web/tests/product-screenshots/route-dom-|apps/web/playwright\.config\.screenshots\.ts|packages/ui/)'
if grep -q -E "$MARKETING_DOM_PATTERN" "$CHANGED_PATHS"; then
  echo "run_marketing_dom=true" >> "$GITHUB_OUTPUT"
else
  echo "run_marketing_dom=false" >> "$GITHUB_OUTPUT"
fi
