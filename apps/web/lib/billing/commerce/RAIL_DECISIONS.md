# Provider access and rail decisions

JOV-8215 consumes the serialized `jovie.commerce-support/v1` matrix owned by
JOV-8214. It projects the fields needed for selection; the matrix producer owns
full platform/source validation. This adds no catalog, checkout, or entitlement
model. `compileRailDecisions` returns one decision per input class, sorted by
class; malformed matrices and duplicate classes fail validation.

Run from the repository root with the existing Node/pnpm pins:

```sh
pnpm --filter @jovie/web exec node --import tsx scripts/commerce-rail-decisions.ts \
  --matrix /tmp/matrix.json --accounts /tmp/accounts.json --access /tmp/access.json
```

`--at` accepts an ISO timestamp for deterministic replay. Omit it for a current
decision. Redirect stdout to retain a decision receipt. Omitted/unreadable/invalid
access evidence resolves to UNKNOWN. Omitted accounts are both unknown. No
credential or API-key presence is interpreted as commerce access; no provider
dashboard, account or SKU was verified by this implementation run.

The import boundary is for a trusted operator's private account observations,
not public requests. Keep raw exports, evidence references and account bindings
private. Never include credentials, customer data or payment tokens. A verified
receipt is an operator attestation backed by the referenced authenticated API
response or dashboard export; the importer does not authenticate that reference.
An inaccessible dashboard must be recorded as unverifiable/UNKNOWN, never as a
grant. Public protocol documentation is not account evidence.

`accounts.json` pins expected provider account identities (a null means UNKNOWN):

```json
{ "openai": null, "stripe": "example-stripe-account" }
```

`access.json` has `version: "jovie.provider-access/v1"` and a `receipts` array.
Every receipt requires these fields (illustrative UNKNOWN observation):

```json
{
  "provider": "stripe",
  "account": "example-stripe-account",
  "capability": "ordinary-web-checkout",
  "resource": null,
  "environment": "UNKNOWN",
  "observedAt": "2026-10-15T18:00:00Z",
  "expiresAt": "2026-10-16T18:00:00Z",
  "result": "UNKNOWN",
  "source": "unavailable",
  "verification": "unverifiable",
  "evidenceRef": null,
  "sku": null
}
```

Verified observations require `source: "account-api"` or `"dashboard"`,
`verification: "verified"`, a private `evidenceRef`, and the actual account.
Only live evidence can grant live access. Expiry must follow observation by at
most 24 hours. Expired/future/unverifiable evidence and simultaneous conflicting
observations become UNKNOWN. A newer denial or unknown observation supersedes
an older grant; input ordering never restores access.

Web selection requires a separate `active-sku` receipt for the configured price:
`resource` equals the price ID and `sku` contains `priceId`, `active`,
`productActive`, `amountCents`, `currency`, and `interval`. Both active booleans
must be true; price, currency and cadence must match the canonical matrix and
the $199/month offer truth. Local configuration alone is not SKU activation.

Ship now: select only ordinary web checkout for the canonical Pro offer after
account/claim handoff and explicit buyer approval, with Jovie as merchant and
current account/SKU evidence. Every other current class is blocked by its
availability, ownership, SKU or uncertified adapter. ACP, ACS, SPT, Projects,
MPP and plugin subscriptions cannot win, even if an import asserts access.
This policy adds no support assertion about those providers' current products.

Re-evaluate when: evidence expires, source is 30 days old, or account, offer,
price, policy, capability or ownership changes. Then: refresh the upstream
matrix and account evidence, rerun selection, and certify any new adapter under
JOV-4077 before changing the policy. Each row includes these decisions, rejected
alternatives, merchant identity, reversibility, and content hashes of the
consumed matrix and access evidence. Selection is separate from a paid canary
or production certification (JOV-8221); this command only reads local files.
