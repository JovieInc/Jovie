# Screen decision routing qualification

Owner: Summer (policy); Gem retains runtime proof authority. Source issue: JOV-7350.

The existing `screen-certification/v2` receipt includes `decisionRouting` from
`scripts/invariants/screen-decision-routing.mjs`. This is a nonblocking
qualification projection under `canon/ENGINEERING.md`, not a new merge gate.
The existing screen proof result and exit code retain their current meaning;
`certified: true` never certifies decision classification, delivery or approval.

The CLI accepts `--decision-file=<JSON path>` alongside its existing options.
The input is a declaration, never an authority receipt. Use the canonical
lowercase full SHA returned by Git:

```json
{
  "schema": "screen-decision-declarations/v1",
  "headSha": "<full current 40-character Git SHA>",
  "changedPaths": ["apps/web/app/(home)/page.tsx"],
  "decisions": [{
    "id": "permanent-product-identity",
    "kind": "event",
    "eventClass": "identity",
    "paths": ["apps/web/app/(home)/page.tsx"],
    "proposedEffect": "Describe the exact proposed permanent identity change.",
    "evidence": ["canon/VOICE.md"]
  }]
}
```

`changedPaths` must equal the complete gate change set, including excluded and
deleted sources. Every decision must bind to changed paths and include its exact
proposed effect and evidence references. Schema/head/path mismatches, duplicate
IDs, unknown fields/kinds, missing evidence and unreadable JSON remain visible
as `classification-unavailable`. Undeclared paths remain `unclassifiedPaths`;
omission never declares a change ordinary. Evidence references are declarations,
not verified contents or trusted provenance.

| Decision kind | Candidate destination | Boundary |
|---|---|---|
| `machine-correctness` | Existing CI | Ordinary reversible corrections do not request founder review. |
| `platform-device-proof` | Gem | Runtime proof authority is unchanged. |
| `consequential-external-action` | Existing action authorization | This projection grants no permission to execute. |
| `event` | Founder review | Identity, security or permanence; existing authority is required before the consequential effect. |
| `founder-strategy-taste` | Founder review | Existing taste steering or post-landing certification; no routine pre-merge human hold (JOV-INV-028). |

Only `event` accepts `eventClass`, one of `identity`, `security`, `permanence`.
Path names never imply EVENT: an ordinary auth bug fix is not automatically a
security-authority change. Multiple decisions may concern one changed source.

`founderReviewCandidates` is a draft projection, not an outbox or sent queue.
All inputs retain `provenance: caller-declaration`. Every receipt explicitly
reports `trustedRoutingAdapter: unavailable`, `deliveryVerified: false` and
`approvalVerified: false`. Caller fields such as `approved` or `routingReceipt`
are rejected, not promoted to authority. No messages, credential access, Ovie
writes or network requests are performed by this projection.

JOV-7350 remains open for a trusted Gem-to-Ovie producer/readback integration and
representative ship-cohort qualification. It must bind the actual decision ID,
revision, exact proposed effect and delivery timestamp through producer-owned
transport; routing must still not imply founder approval. Before any enforcement
promotion, record correctness/pass rate, p95, throughput/cost, failure isolation,
owner and rollback under the existing engineering canon. No numeric promotion
threshold or H-EX-09 closure is established here.

Verification uses the existing `invariants:check` Node test selector, including
real screen-gate positive/negative cases, CLI JSON/receipt paths and deliberate
stale/forged/missing input cases. That selector enforces helper coverage at
95% lines, 90% branches and 100% functions. These are local mechanism tests,
not live founder-delivery or platform runtime certification.
