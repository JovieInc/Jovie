# Investor follow-up contract v0.1

- **Issue:** JOV-5026
- **Scope:** contract-only slice. `apps/web/lib/investors/followup-contract.ts` defines how one private question record plus one approved canonical answer revision becomes a personalized email draft for the operator review queue.
- **Sends:** none. A draft never implies a send; composing, previewing, or scanning a draft cannot consume approval or transition delivery state.

## What the contract enforces

- **Composition:** the body must contain the source answer's direct answer in a few sentences, may carry one link (an approved public article or an authorized private memo with an explicit access expiry), and exactly one next step. It stays useful without a click.
- **Binding:** drafts retain the source question id, answer id and version, exact claim revisions, authorized sender, resolved recipient, and an existing thread id when present. An existing conversation is not enrollment in recurring mail.
- **Public URL hygiene:** public links cannot embed the investor name, email, the private question text (raw or URL-encoded), or bearer/token parameters, and must be https. Private memo links follow the JOV-5025 access model and require `accessExpiresAt`.
- **Approval:** `prepareInvestorFollowupApproval` binds the exact payload hash, recipient, sender, destination (`provider` or `operator-manual` copy-and-send), expiry, and one permitted action. Any material change requires a new approval.
- **Pre-delivery recheck:** `recheckInvestorFollowupBeforeDelivery` fails closed on stale answer/claim revisions, changed payload or recipient, expired approval, revoked private access, recipient suppression, or the outbound kill switch.
- **Delivery ledger:** `transitionInvestorFollowup` walks `draft → approved → queued → provider_accepted → delivered | bounced | failed | unknown`. Provider acceptance is not confirmed delivery; ambiguous acknowledgments land in `unknown` and cannot be resent until reconciled. Terminal states accept no further sends; retries from `failed` are bounded.
- **Idempotency:** `idempotencyKey` is deterministic over question, answer version, recipient, and payload hash, so replayed jobs produce the same key and `isInvestorFollowupReplay` detects already-ledgered outcomes before a second send.
- **Manual fallback:** `destination: 'operator-manual'` with `permittedAction: 'copy-manual'` supports honestly labeled operator-reported receipts instead of invented provider ids.

## Deliberately out of scope for this slice

Persistence, the review-queue UI, scheduler, provider integration, SAFE/allocation/close flows, and automatic outreach based on views or inferred interest. Those arrive as follow-on slices that consume this contract; nothing here sends anything.
