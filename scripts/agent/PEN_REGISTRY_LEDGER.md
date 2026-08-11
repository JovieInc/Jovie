# Pen registry ledger — singular, mechanical, contradiction-free (JOV-4969)

The canonical Pen document must expose exactly one machine-recomputable source
of truth for registry status. No designer or agent may see contradictory
SAFE/PARTIAL/BLOCKED claims for the same identity.

## Authoritative status field

`metadataStatus` on the registry root record is the **only** authoritative
status field. Everything else — visible ledger rows, row names, receipts
canvases — is derived. A visible status string that differs from
`metadataStatus` is a defect, not a second opinion.

Statuses: `SAFE`, `PARTIAL`, `BLOCKED` for registered identities; `PROPOSAL`
for NOT SOURCE-BACKED work. PROPOSAL rows are never counted in SAFE totals or
in the SAFE/PARTIAL/BLOCKED denominator.

## Receipt precedence model

Status is computed from receipts, never asserted by hand:

- `SAFE` requires all five evidence classes measured against the **exact
  current source SHA**: `source`, `runtime-desktop` (1024),
  `runtime-narrow` (390), `same-node-readback`, and
  `containing-production` — and no open blocker.
- Exact current-source evidence wins. A receipt carrying any other SHA is
  stale. Stale proof must be explicitly marked `expired: true` with an
  `expiredReason`; silently retained stale proof fails the audit.
- Source identity and runtime generation are distinct. A `source` receipt may
  stay current across a newer SHA only with an explicit `currentThrough`
  compare proof (source files unchanged between the receipted SHA and the
  current SHA). `runtime-desktop`, `runtime-narrow`, `same-node-readback`,
  and `containing-production` receipts are generation-bound: they must be
  refreshed at the exact current SHA or explicitly expired.
- Otherwise: `BLOCKED` when a blocker is named or no valid source receipt
  exists; `PARTIAL` when some but not all SAFE evidence is valid.

`metadataStatus` must equal the recomputed status. Underclaiming
(PARTIAL where SAFE is entitled) and overclaiming (SAFE without full
evidence) are both contradictions.

## Mechanical workflow

1. Export the registry roots and receipts from the canonical document into a
   `pen-registry-ledger/v1` JSON file (one record per registry identity,
   `registeredIdentities` listing every registry root).
2. Run `node scripts/agent/pen-registry-audit.mjs <ledger.json>`. Exit 1 with
   typed failures on: visible vs metadata status mismatch
   (`visible-status-mismatch`), duplicate authoritative records
   (`duplicate-authoritative-record`), duplicated root nodes
   (`duplicate-root-node`), unentitled SAFE (`unsafe-safe`), silently retained
   stale proof (`stale-proof-retained`), status that does not recompute
   (`status-not-recomputable`), records for non-registered identities
   (`unknown-registered-identity`), or a denominator that does not equal the
   number of unique registered identities (`denominator-mismatch`). Exit 2
   means the export itself is malformed.
3. Only on a passing audit, generate the visible ledger with
   `node scripts/agent/pen-registry-audit.mjs <ledger.json> --render` and
   write exactly those rows into the document. No manually duplicated status
   strings.
4. Legacy `registry-disposition` nodes are deleted or archived only after
   their useful notes are migrated onto the canonical root record (as a
   blocker, receipt note, or `expiredReason`). Never create replacement
   registry roots or duplicate component identities.

## Current execution boundary

The in-document steps (backup, visible-row regeneration, disposition archival,
denominator recompute) require the Pen writer lane on the canonical file.
That lane is fail-closed until the single-writer preflight passes; see
`PEN_SAVE_RECEIPT.md` and `pen-workspace-locks.json`. This CLI is the
deterministic gate that lane must satisfy before and after any mutation.
