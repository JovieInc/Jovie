# Commerce support projection

`getCommerceSupportMatrix()` returns the JSON-serializable
`jovie.commerce-support/v1` matrix. It composes canonical offer truth, active and
legacy Stripe mappings, flag defaults, and existing product/checkout/evidence
boundaries. It creates no products, prices, catalog, endpoints, or channel access.

```ts
import { getCommerceSupportMatrix } from '@/lib/billing/commerce/support-matrix';
import { validateSupportMatrix } from '@/lib/billing/commerce/support-contract';

const json = JSON.stringify(getCommerceSupportMatrix());
const matrix = validateSupportMatrix(JSON.parse(json));
```

The server-only projection resolves configured price IDs and amounts from
`stripe/config.ts` and offer amounts from `config/plan-prices.ts`. A null amount
means there is no class-wide price: merch cards, external stores, and legacy
subscriptions retain their own canonical prices. Stripe Product IDs are not
locally mapped and remain null with an explicit limitation. Never mint IDs to
fill these gaps.

Runtime source bindings identify the existing per-request flag, per-creator
Connect, fulfillment, and entitlement guards. Flag defaults are labeled as
defaults, not observed production values. A web fallback is a handoff or guarded
path, not proof that checkout, payment, delivery, or payout succeeded. Ancillary
thumbnail subscriptions and retired plan prices are existing-subscriber-only.

`platform-evidence.ts` owns first-party `jovie.commerce-evidence/v1` receipts.
Each records a URL, observation/recheck dates, applicable access/terms constraints,
uncertainty, and markets. Provider documentation never establishes Jovie admission.
The unavailable Stripe Connect SPT variant stays UNKNOWN. No current channel is
represented as supported.

Ownership must be assigned to a named party, explicitly inapplicable, or an
explicit blocker with a resolution owner and issue. Blocked ownership requires
blocked availability and cannot support a sales claim. In particular, a platform
charge does not establish merch merchant-of-record or refund/support policy;
[JOV-4077](https://linear.app/jovie/issue/JOV-4077) owns those acceptance receipts.
Missing, free-text ambiguous, or inapplicable required ownership fails validation
for supported sales. UNKNOWN, gated, unsupported, expired, or mismatched evidence
cannot back support, even alongside a valid receipt.

Ship now: persist the conservative support projection and fail-closed validator.
Re-evaluate when: canonical primitives or provider policies/access change, or the
30-day evidence recheck date arrives. Then: refresh the affected receipts and
source observation, resolve ownership and admission through JOV-4077, and validate
again before publishing a support claim. Historical non-support receipts remain
readable after expiry; caching never renews their authority. Change the contract
version when its meaning or required shape changes.
