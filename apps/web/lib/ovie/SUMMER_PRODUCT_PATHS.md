# Product path evidence bridge

`POST /api/internal/ovie/summer-bottleneck` accepts the optional
`signals.productPaths` projection with schema `jovie.eve.summer-product-paths/v1`.
Legacy snapshots remain valid. The product-owned validator in
`summer-product-paths.ts` validates the wire contract only; Summer owns ranking,
claims, execution authority, and the decision loop in its private repository.

The bridge reuses `OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN` through
`getEveShadowOrigin`, including the existing exact-deployment allowlist. Missing
or invalid configuration fails before signing or obtaining OIDC credentials.
The request includes both the bearer token and
`x-vercel-trusted-oidc-idp-token`, disallows redirects, and makes one attempt.
An uncertain network result does not establish delivery and is never retried
inside this bridge.

The projection contains a source revision and digest, observation time,
reference, a bounded cohort window and definition revision, environment and
deployment revision, and 1–16 unique paths. Every path declares its interface,
stage, owner, handle, basis, and nullable measurement. The outer snapshot binds
the projection source revision to its own exact source version. Journey and
payment counts must refer to the same cohort; terminal outcomes cannot exceed
attempts. Paid conversions count collected positive payments within successful
cohort journeys. A subscription state does not prove payment. Failed plus
abandoned journeys describe observed outcome opportunity, not all errors or
recoverable revenue.

Stale, local, sparse, or incomplete evidence is preserved as explicitly labelled
input for Summer to downgrade; the bridge does not promote it to measured
production conversion. Existing freshness checks on the outer snapshot and
engineering projections remain in force. Unknown fields, invented lift,
inconsistent cohorts, and malformed counts are rejected.

`fixtures/summer-product-paths-v1.json` contains synthetic compatibility cases
for both independently owned validators. The existing route tests apply each
case and verify the signed forwarded payload. Receiver support must be deployed
before a caller starts sending the optional field: older strict receivers reject
it. Changes to this contract require rerunning these cases against both owners'
validators; policy code is never copied into the product application.

No telemetry aggregation job or production caller is added here. A product-owned
producer still needs to define journeys, terminal outcomes, cohort membership,
payment attribution, completeness, and source receipts from actual telemetry,
then submit the aggregate through this authenticated bridge. Source digests and
references are assertions of that authenticated producer; the bridge does not
independently query or verify the underlying telemetry. Fixture numbers are test
data and provide no evidence of production incidence or conversion.
