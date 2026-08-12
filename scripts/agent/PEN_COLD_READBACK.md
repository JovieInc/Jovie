# Pen cold-manifest fail-closed gate

`pen-cold-readback.mjs` reports whether the pinned Pen runtime can produce a
complete semantic manifest without evaluating code, opening the document, or
reading the `.pen` file. `pen-promotion-gate.mjs` converts that receipt plus a
`pen-save-receipt/v1` into the strongest truthful promotion claim.

## Current capability

Pen desktop 1.2.4 and `@pen.dev/cli` 0.3.2 expose no native, non-evaluating,
complete semantic inspector. Top-level and component enumeration require
`execute(Get/Print...)`, which produced `file-changed` events and backup writes
during JOV-4967. Headless `pen interactive --in` also opens a document and can
create output.

Those are not cold readback.

The current command therefore performs only two reads:

1. the versioned `pen-workspace-locks.json` profile; and
2. the current clock for `recorded_at`, unless supplied explicitly.

It does not launch Pen. It does not open, stat, hash, read, create, or write a
`.pen` document. Former fixture, CLI, manifest, timeout, and expected-component
arguments are rejected before target access.

## Exact receipt

```json
{
  "schema": "pen-cold-readback/v2",
  "verdict": "cold_readback_failed",
  "typed_reasons": ["safe_cold_manifest_unavailable"],
  "semantic_manifest": null,
  "semantic_manifest_complete": false,
  "inspection_method": null,
  "execute_invoked": false,
  "save_invoked": false,
  "document_opened": false,
  "output_document_created": false,
  "durability": "not_proven",
  "exit_code": 1
}
```

The receipt also includes the pinned workspace profile, canonical path string,
timestamp, and typed blockers. Path identity is configuration evidence only. It
does not prove that the file exists, is writable, is saved, or is durable.

## Invocation

```bash
node scripts/agent/pen-cold-readback.mjs \
  --profile jovie-founder-design-studio
```

Exit codes:

- `1`: expected fail-closed receipt, safe inspector unavailable.
- `2`: malformed invocation or unknown workspace profile.
- `0`: reserved for a future, separately reviewed native inspector contract;
  unreachable in the current implementation.

`--help` is the standard non-gate exception: it exits `0` and writes usage text,
not a JSON receipt. Automation must parse and validate the expected JSON schema
and claim; exit status alone is never promotion evidence.

## Promotion gate

```bash
node scripts/agent/pen-promotion-gate.mjs \
  --save-receipt /path/to/save-receipt.json \
  --cold-readback-receipt /path/to/cold-readback.json
```

Claims:

| Claim | Meaning |
| --- | --- |
| `live_readback_only` | The save receipt passed, but safe cold semantic reconciliation is unavailable. Exit 1. |
| `unverified` | The save receipt did not pass. Exit 1. |
| `cold_round_trip_verified` | Reserved for a future reviewed native inspector contract. Unreachable today. |

The gate resolves the save receipt's workspace profile through the versioned
file lock and validates the complete successful `pen-save-receipt/v1` output
contract: canonical path identity, clean state, exclusive writer/batch/root
facts, explicit-save acknowledgement, ordered timestamps, evidence digests,
`durability: not_proven`, and an explicit empty blocker list. A schema and
passing verdict alone are `unverified`.

## Native inspector receipt boundary

`pen-native-semantic-manifest-contract.mjs` is the repository-owned validator
for a future separately reviewed Pen receipt. It validates, without opening a
`.pen` file, that the native producer supplied the exact profile-locked source
path, source-byte identity, runtime/build identity, zero
execute/open/switch/output/save/backup/file-change activity, and a complete
root-to-descendant graph. The validator resolves the path, complete node
inventory, and ordered roots only from `pen-workspace-locks.json`; receipt-side
options cannot replace that authority. The production profile remains
explicitly unavailable until a reviewed Pen-native inventory exists, so all
receipts fail closed in the meantime. The validator recomputes the
canonical-manifest SHA-256 over the normalized graph. Every node must have stable identity, type/name,
reusable/ref identity, ordered child IDs, and a properties digest; unreachable
nodes, missing children, malformed child lists, duplicate IDs, and cycles fail
closed.

`diffPenSemanticManifests` compares only native-produced semantic data by node
ID and every normalized semantic field, including ordered children and ordered
roots. It returns stable sorted `added`, `removed`, and `changed` IDs plus a
root-order signal, and never reads either source artifact. This boundary is not a
vendor inspector and is intentionally not wired to produce
`cold_round_trip_verified`; the current promotion claim remains
`live_readback_only` until Pen ships and Jovie separately reviews the native
producer and receipt evidence.

Legacy `pen-cold-readback/v1` component inventories are explicitly downgraded as
`partial_component_evidence`. A forged v2 `cold_readback_verified` receipt cannot
promote because the source contains no reviewed native inspector.

Receipt paths must name single-link regular `.json` files no larger than 1 MB.
The gate opens them read-only with `O_NOFOLLOW`, validates the opened descriptor,
and performs a bounded read. Symlinks, hard links, non-regular files, and oversized
receipts fail with JSON error output and exit `2`.

## Safety boundary

This gate never authorizes save, recovery-overlay reconciliation, document
switching, or Pen mutation. Continue to follow [`PEN_SAVE_RECEIPT.md`](PEN_SAVE_RECEIPT.md)
and the workspace lock in [`AGENTS.md`](../../AGENTS.md). If a native inspector is
added later, it requires a separate source review proving complete, non-elided
root and descendant coverage without `execute`, document open, or `.pen` reads.
