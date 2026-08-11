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

Legacy `pen-cold-readback/v1` component inventories are explicitly downgraded as
`partial_component_evidence`. A forged v2 `cold_readback_verified` receipt cannot
promote because the source contains no reviewed native inspector.

## Safety boundary

This gate never authorizes save, recovery-overlay reconciliation, document
switching, or Pen mutation. Continue to follow [`PEN_SAVE_RECEIPT.md`](PEN_SAVE_RECEIPT.md)
and the workspace lock in [`AGENTS.md`](../../AGENTS.md). If a native inspector is
added later, it requires a separate source review proving complete, non-elided
root and descendant coverage without `execute`, document open, or `.pen` reads.
