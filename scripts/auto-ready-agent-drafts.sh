#!/usr/bin/env bash
# Retired: only the completing writer may submit fresh exact-head merge intent.
# Historical proof, an observer flag, or a restored workflow cannot revive this writer.
set -euo pipefail
printf '%s\n' 'ERROR: fleet draft promotion is retired; owner completion required; no action was taken.' >&2
printf '%s\n' 'Use scripts/writer-owned-pr-promote.sh with fresh writer identity, exact head, and qualification evidence.' >&2
exit 2
