#!/usr/bin/env bash
# Offline discovery regression using the checksum-pinned official CLI.
# Usage: bash scripts/security/osv-source.test.sh /path/to/osv-scanner
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
scanner="$(realpath "${1:?pass the official OSV v2.5.1 binary}")"
expected_sha=f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be
printf '%s  %s\n' "$expected_sha" "$scanner" | sha256sum -c -

fixture="$(mktemp -d "${TMPDIR:-/tmp}/jovie-osv-source.XXXXXX")"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/nested/node" "$fixture/nested/python" \
  "$fixture/.agents/skills/gstack" "$fixture/.github/requirements"
git -C "$fixture" init -q
printf '.agents/skills/gstack/*\n' > "$fixture/.gitignore"
cat > "$fixture/package-lock.json" <<'EOF'
{"name":"root-fixture","lockfileVersion":3,"packages":{"":{"name":"root-fixture","version":"1.0.0"},"node_modules/lodash":{"version":"4.17.21"}}}
EOF
cat > "$fixture/nested/node/package-lock.json" <<'EOF'
{"name":"nested-fixture","lockfileVersion":3,"packages":{"":{"name":"nested-fixture","version":"1.0.0"},"node_modules/minimist":{"version":"1.2.8"}}}
EOF
cat > "$fixture/.agents/skills/gstack/bun.lock" <<'EOF'
{"lockfileVersion":1,"workspaces":{"":{"name":"fixture","dependencies":{"is-number":"7.0.0"}}},"packages":{"is-number":["is-number@7.0.0","",{},""]}}
EOF
printf 'requests==2.32.3\n' > "$fixture/nested/python/requirements.txt"
printf 'pytest==8.4.2\n' > "$fixture/.github/requirements/pytest.txt"

# Read arguments from the actual workflow rather than duplicating its flags.
# Each argument is a literal token; no workflow shell text is evaluated.
cd "$repo_root"
node --input-type=module > "$fixture/args" <<'EOF'
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
const workflow = load(readFileSync('.github/workflows/security.yml', 'utf8'));
const step = workflow.jobs.osv.steps.find(step => step.run?.includes('./osv-scanner scan source'));
const line = step?.run.split('\n').find(line => line.trim().startsWith('./osv-scanner scan source'));
if (!line) throw new Error('missing OSV source command');
process.stdout.write(line.trim().split(/\s+/).slice(1).join('\n') + '\n');
EOF
mapfile -t workflow_args < "$fixture/args"
cd "$fixture"

discover() {
  local log="$1" result=0
  shift
  "$scanner" "$@" > "$log" 2>&1 || result=$?
  # Without a cached database the CLI still reports extraction, then exits 127.
  # Never interpret that extraction evidence as a successful vulnerability scan.
  if [[ "$result" -eq 127 ]] && rg -q 'no offline version of the OSV database is available' "$log"; then
    return
  fi
  if [[ "$result" -gt 1 ]]; then
    cat "$log" >&2
    return "$result"
  fi
}

discover before.log scan source --offline --no-resolve --format sarif --output-file before.sarif .
discover after.log "${workflow_args[@]:0:2}" --offline --no-resolve "${workflow_args[@]:2}"

before_count="$(rg -c '^Scanned .* file and found ' before.log)"
after_count="$(rg -c '^Scanned .* file and found ' after.log)"
[[ "$before_count" -eq 1 ]] || { cat before.log >&2; exit 1; }
[[ "$after_count" -eq 5 ]] || { cat after.log >&2; exit 1; }
for source in package-lock.json nested/node/package-lock.json nested/python/requirements.txt \
  .agents/skills/gstack/bun.lock .github/requirements/pytest.txt; do
  rg -Fq "Scanned $fixture/$source file and found 1 package" after.log
done
printf 'PASS: pinned OSV discovery: original=1 source, workflow=5 sources; vulnerability results not asserted\n'
