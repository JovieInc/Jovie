#!/usr/bin/env bash
set -euo pipefail

output_path="${1:-/tmp/vercel-build-output.tar.gz}"
archive_path="${output_path%.gz}"
closure_list="$(mktemp)"
trap 'rm -f "$closure_list" "$archive_path"' EXIT

node .github/scripts/vercel-artifact-closure.mjs verify
node .github/scripts/vercel-artifact-closure.mjs list-null > "$closure_list"

# Preserve the generated Vercel output as-is, then materialize every external
# .next runtime path referenced by its .vc-config.json file maps. Dereferencing
# only the appended closure prevents pnpm symlinks from dangling on the deploy
# runner without duplicating all function output dependencies.
tar -cf "$archive_path" .vercel/output
tar --append --file "$archive_path" --dereference --null --files-from="$closure_list"
gzip -f "$archive_path"

tar -tzf "$output_path" .vercel/output >/dev/null
echo "Packaged Vercel build output with generated runtime dependency closure"

