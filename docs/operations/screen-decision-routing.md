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

`founderReviewCandidates` remains a declaration projection. Caller fields such
as `approved` or `routingReceipt` are rejected, not promoted to authority. The
projection itself performs no network requests and reports delivery unavailable.

The explicit `--route-event-reviews --decision-issue=JOV-1234` CLI options run
`scripts/invariants/screen-event-routing.mjs` after the existing screen gate.
The caller must already be the authorized production Summer runtime: the fixed
`https://jov.ie/api/internal/ovie/summer-cards` endpoint verifies its
`VERCEL_OIDC_TOKEN` against the existing Summer project identity. An ordinary
Gem/CI token cannot acquire that authority through a declaration. Do not copy a
Summer credential to a Gem worker. Without the options, no delivery is attempted;
without accepted credentials, the receipt reports delivery unavailable.

The adapter seals an existing `jovie.work-order/v1` founder decision and uses
`toSummerCard` to submit it to the existing durable Ovie inbox. The identity binds
the issue, exact head, complete change set, EVENT ID/class, effect and evidence.
Revision 1 is content-bound; changing any bound input creates a different order.
The exact commit timestamp makes identical requests stable across replay. No
exception date is changed. Silence grants no approval or permission to execute.

Only a matching persisted card returned by the production endpoint produces an
`eventDelivery` receipt. It includes the sealed order, actual card reference,
delivery/observation timestamps and an uncertified `jovie.work-result/v1`
acknowledgement bound to the order revision/digest. HTTP errors, redirects,
malformed/mismatched/stale responses and partial delivery remain explicit. An
idempotent replay reads the same stored card. Even an already-approved card is
only delivery evidence here: `approvalVerified` stays false. Gem retains runtime
proof authority; screen verdicts, proof requirements and exit codes are unchanged.

The attempt has one shared 10-second deadline, no automatic retry, at most four
EVENT packets, zero authorized spend and one attempt/concurrency per order. Each
packet allows at most eight 200-character paths, a 64-character ID and a
1,000-character effect. Orders expire seven days after the exact commit, with a
five-minute clock tolerance, and budget five founder minutes. Oversized/expired
packets fail safe. Ordinary work and taste keep their existing routes; mixed
EVENT/taste requests cannot report all founder delivery verified.

Ship now: explicit nonblocking EVENT transport and producer readback. Re-evaluate
when: representative actual ships have qualification receipts under JOV-7350.
Then: the existing owner may promote only with correctness/pass rate, p95,
throughput/cost, failure isolation and rollback evidence under the engineering
canon. Local fixtures establish mechanism behavior; they do not prove live
founder delivery, deployment, founder approval, or H-EX-09 acceptance.

Verification uses `invariants:check`: the existing scanner-heavy screen and
latency suites stay outside V8 coverage. A separate small routing suite measures
real screen-gate positive/negative cases, CLI JSON/receipt paths and deliberate
stale/forged/missing input cases. Its selector enforces helper coverage at
95% lines, 90% branches and 100% functions for both routing helpers. These are
local mechanism tests, not live founder-delivery or platform runtime certification.
