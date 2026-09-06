#!/usr/bin/env bash
# Retired: agents submit one explicit exact-head native merge intent.
# No legacy authorization, dry-run flag, or fleet receipt reactivates this writer.
set -euo pipefail
printf '%s\n' 'ERROR: legacy external admission drain is retired; no action was taken.' >&2
printf '%s\n' 'Submit a qualified task completion explicitly: node scripts/native-merge-intent.mjs --repo OWNER/REPO --pr NUMBER --head EXACT_SHA' >&2
exit 2
