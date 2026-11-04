#!/usr/bin/env bash
# Exercise the real staged scanner against the exact public digest baseline.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
scanner="${GITLEAKS_BIN:?GITLEAKS_BIN must name an installed scanner}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
git -C "$tmp_dir" init -q
mkdir -p "$tmp_dir/scripts/security"
cp "$root/scripts/security/scan-secrets.sh" "$tmp_dir/scripts/security/"
cp "$root/scripts/security/gitleaks-staged-public-digests.b64" "$tmp_dir/scripts/security/"
cp "$root/.gitleaks.toml" "$tmp_dir/.gitleaks.toml"
node -e 'const fs = require("node:fs"); const path = require("node:path"); const findings = JSON.parse(Buffer.from(fs.readFileSync(process.argv[1], "utf8").trim(), "base64")); for (const file of new Set(findings.map(f => f.File))) { if (!file.startsWith("docs/operations/evidence/summer-revenue-readiness-2026-10-26/") || file.includes("..")) process.exit(1); const dest = path.join(process.argv[3], file); fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.copyFileSync(path.join(process.argv[2], file), dest); }' \
  "$root/scripts/security/gitleaks-staged-public-digests.b64" "$root" "$tmp_dir"
printf '#!/bin/sh\nexit 0\n' >"$tmp_dir/fake-trufflehog"
chmod 700 "$tmp_dir/fake-trufflehog"
export GITLEAKS_BIN="$scanner" TRUFFLEHOG_BIN="$tmp_dir/fake-trufflehog"
cd "$tmp_dir"
git add .gitleaks.toml scripts/security/scan-secrets.sh scripts/security/gitleaks-staged-public-digests.b64 docs
bash scripts/security/scan-secrets.sh pre-commit >"$tmp_dir/known.log" 2>&1

# A new secret in an otherwise baselined evidence file must still block.
file=docs/operations/evidence/summer-revenue-readiness-2026-10-26/admission-local.jsonl
cat "$root/scripts/security/gitleaks-default-fixture.txt" >>"$file"
git add "$file"
if bash scripts/security/scan-secrets.sh pre-commit >"$tmp_dir/new-secret.log" 2>&1; then
  echo 'FAIL: new same-file secret was not blocked' >&2
  exit 1
fi
grep -q 'leaks found' "$tmp_dir/new-secret.log"

# Worktree bytes can differ from staged bytes. The staged baseline, not a
# clean worktree copy, must be authenticated before the scanner starts.
printf 'dGFtcGVyZWQ=\n' >scripts/security/gitleaks-staged-public-digests.b64
git add scripts/security/gitleaks-staged-public-digests.b64
cp "$root/scripts/security/gitleaks-staged-public-digests.b64" scripts/security/
if bash scripts/security/scan-secrets.sh pre-commit >"$tmp_dir/tampered.log" 2>&1; then
  echo 'FAIL: staged baseline tampering was not blocked' >&2
  exit 1
fi
grep -q 'Secret scan baseline invalid' "$tmp_dir/tampered.log"
git update-index --force-remove scripts/security/gitleaks-staged-public-digests.b64
if bash scripts/security/scan-secrets.sh pre-commit >"$tmp_dir/missing.log" 2>&1; then
  echo 'FAIL: missing staged baseline was not blocked' >&2
  exit 1
fi
grep -q 'Secret scan baseline invalid' "$tmp_dir/missing.log"
echo 'PASS: exact public digests, new same-file secrets, and staged baseline integrity'
