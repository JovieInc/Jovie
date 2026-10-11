#!/usr/bin/env bash
set -euo pipefail
files=(
  apps/web/lib/hud/number-series.ts
  packages/ui/lib/utils.ts
  apps/web/tests/unit/utils.test.ts
  apps/web/lib/design/generated/design-tokens.ts
  packages/extension-contracts/index.ts
  apps/web/lib/extensions/summary.ts
)
backup="$(mktemp -d)"
cleanup() { for index in "${!files[@]}"; do cp "$backup/$index" "${files[$index]}"; done; rm -f apps/web/.cache/tsbuildinfo-safety packages/ui/.cache/tsbuildinfo-safety; rm -r "$backup"; }
for index in "${!files[@]}"; do cp "${files[$index]}" "$backup/$index"; done
trap cleanup EXIT
printf '\nexport const __appProbe: string = 42;\n' >> "${files[0]}"
printf '\nexport const __sharedProbe: string = 42;\n' >> "${files[1]}"
printf '\nconst __testProbe: string = 42;\n' >> "${files[2]}"
printf '\nexport const __generatedProbe: string = 42;\n' >> "${files[3]}"
printf "\nexport const __crossProbe = 'wrong' as const;\n" >> "${files[4]}"
printf "\nimport { __crossProbe } from '@jovie/extension-contracts';\nconst __crossConsumer: number = __crossProbe;\n" >> "${files[5]}"
expect_errors() {
  local label="$1" expected="$2" output status
  shift 2
  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  if [[ $status -eq 0 ]]; then echo "$label accepted intentional errors" >&2; exit 1; fi
  while IFS= read -r path; do
    if [[ "$output" != *"$path"* ]]; then echo "$label missed $path" >&2; exit 1; fi
  done <<< "$expected"
  printf '[typecheck-safety] %s caught all probes\n' "$label"
}
expect_errors web $'lib/hud/number-series.ts\nlib/design/generated/design-tokens.ts\nlib/extensions/summary.ts' corepack pnpm --filter=@jovie/web exec tsc -p tsconfig.typecheck.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo-safety --pretty false
expect_errors shared 'lib/utils.ts' corepack pnpm --filter=@jovie/ui exec tsc --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo-safety --pretty false
expect_errors tests 'apps/web/tests/unit/utils.test.ts' node scripts/typecheck-web-tests.mjs
