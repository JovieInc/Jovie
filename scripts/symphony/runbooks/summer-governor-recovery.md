# Summer governor recovery runbook

**Subsystem:** `apps/eve-pilot/agent/select-identity.ts` +
`apps/eve-pilot/agent/lib/governor-route.ts` +
`apps/eve-pilot/agent/lib/governor-buffer.ts` +
`apps/eve-pilot/agent/channels/summer-shadow.ts` +
`apps/eve-pilot/agent/channels/summer-bottleneck.ts` +
`apps/eve-pilot/agent/instructions.md` +
`apps/eve-pilot/identities/summer/instructions.md`

**Severity:** P0 when Summer is routing or enforcing certified work in a way
that may cause harmful autonomous mutations, because the governor path can
admit, route, and enforce work through the durable Eve/Symphony outbox.

**Owner:** on-call operator with deployment access to the Vercel environment
hosting `apps/eve-pilot` and the Ovie MCP control plane.

## Entry criteria

Enter this runbook when any of the following are true:

- `apps/eve-pilot` is emitting governor `RouteReceipt`s or buffer promotions for
  work that is uncertified, misrouted, or outside the bounded repair task.
- The `SUMMER_GOVERNOR_ENFORCE_ENABLED` environment variable is set to `true`
  and Summer is enforcing a policy that blocks safe work or allows unsafe work.
- Summer is admitting Ovie initiatives, Linear/Symphony admission leases, or
  certified workflow policies that are not source-bound, signed, or
  rate-limit-surviving.
- The `ovie-summer-bottleneck` channel is writing outbox items other than the
  allowlisted `jovie-symphony-repair-task/v1`.
- The `ovie-summer-shadow` observation channel is being used to dispatch work or
  mutate external systems (it must stay read-only).
- Governor route receipts show `riskTier: 'critical'` or `authority: 'automation'`
  without the expected `certificationPredicate` and evidence refs.

## Exit criteria

Do not leave the runbook until all of the following are true for at least
5 minutes:

- `SUMMER_GOVERNOR_ENFORCE_ENABLED` is `false` (admit/route mode) unless there
  is an explicit, time-bound, human-authorized reason to be in enforce mode.
- The Summer identity pack fails closed for `governor-enforce` when
  `SUMMER_GOVERNOR_ENFORCE_ENABLED` is unset or not `true`.
- The `ovie-summer-shadow` channel is confirmed read-only and not dispatching.
- The `ovie-summer-bottleneck` channel is writing only the allowlisted repair
  task, or no work at all if it was the locus of harm.
- All governor receipts, buffer plans, and admission leases are auditable,
  source-bound, and signed.
- Any recovery action is idempotent (re-checking the mode does not re-admit
  the same harmful work).
- The recovery lane has not admitted any product, credential, or migration work
  outside the bounded scope of the incident.

## 1. Safe stop / kill switch

The fastest safe stop is to flip Summer from enforce mode to admit/route mode.
This keeps the read-only observation and bounded admission paths alive while
stopping autonomous enforcement of certified policies.

Set the environment variable in the deployment and redeploy:

```bash
SUMMER_GOVERNOR_ENFORCE_ENABLED=false
```

In Vercel:

```bash
vercel env rm SUMMER_GOVERNOR_ENFORCE_ENABLED production
vercel env add SUMMER_GOVERNOR_ENFORCE_ENABLED production false
vercel --prod
```

To stop the broader Ovie MCP control plane admission path (do not use this to
bypass CI or merge gates):

```bash
vercel --prod --yes
# or set EVE_IDENTITY=jovie on the deployment so the runtime defaults to Jovie
```

To stop the Summer shadow observation surface if it is being misused for
non-observation work:

```bash
SUMMER_SHADOW_ENABLED=false
```

Use these flips only when Summer is actively causing harm. The shadow channel
never mutates external systems; the bottleneck channel writes only the
allowlisted repair task; the Ovie MCP control plane is the only governor
execution surface.

## 2. Inspect current state and blast radius

Check the current Summer identity pack and the enforce/admit mode:

```bash
cd "$JOVIE_REPO"
node -e "
const { bindEvePilotIdentity } = require('./apps/eve-pilot/agent/select-identity.ts');
console.log(bindEvePilotIdentity('summer').pack);
" 2>/dev/null || \
  tsx -e "import { bindEvePilotIdentity } from './apps/eve-pilot/agent/select-identity.ts'; console.log(bindEvePilotIdentity('summer').pack);"
```

Or read the source directly:

```bash
grep -A3 'SUMMER_GOVERNOR_ENFORCE_ENABLED' apps/eve-pilot/agent/select-identity.ts
```

Check the environment variable in the live deployment:

```bash
vercel env ls production
```

Inspect recent governor receipts in the Eve durable outbox or state store.
Exact paths depend on the configured persistence backend (Vercel Blob, local
immutability store, or the Ovie receipt stream). Look for:

- `schema: 'jovie.eve.governor.route-receipt/v1'`
- `schema: 'jovie.eve.governor.buffer/v1'`
- `schema: 'jovie-symphony-admission/v1'`
- `schema: 'jovie-symphony-repair-task/v1'`

Run the focused governor tests to confirm the current mode is fail-closed:

```bash
cd "$JOVIE_REPO"
pnpm --dir apps/eve-pilot --ignore-workspace run test -- tests/identity-packs.test.ts
```

Interpret the blast radius:

| Mode | Likely impact |
|---|---|
| `SUMMER_GOVERNOR_ENFORCE_ENABLED=true` | Summer may enforce certified policies, block legacy routes, and interpose on non-certified paths. |
| `SUMMER_GOVERNOR_ENFORCE_ENABLED=false` (default) | Summer may admit and route certified work but cannot enforce policies autonomously. |
| `EVE_IDENTITY=jovie` | The runtime defaults to Jovie; Summer governor channels are not bound. |
| `SUMMER_SHADOW_ENABLED=false` | The read-only shadow observation channel is disabled. |

## 3. Quarantine harmful work

Until the governor is healthy again:

- Do not deploy new code that exercises the governor path without a green test run.
- Do not manually create Linear/Symphony admission leases outside the
  source-bound durable outbox.
- Do not delete or mutate Eve receipts, outbox items, or identity packs before
  preserving evidence.
- Hold any changes to `apps/eve-pilot/agent/select-identity.ts`,
  `apps/eve-pilot/agent/lib/governor-route.ts`, or
  `apps/eve-pilot/agent/lib/governor-buffer.ts` until the incident is
  contained.

If the bottleneck channel is the locus of harm, set its signing keys to an
invalid state or disable the channel deployment while preserving the immutable
receipts for later reconciliation.

## 4. Replay or resume safe work

Once the cause is contained, flip Summer back to enforce mode only with
explicit human authorization and a bounded time window:

```bash
SUMMER_GOVERNOR_ENFORCE_ENABLED=true
```

In Vercel:

```bash
vercel env rm SUMMER_GOVERNOR_ENFORCE_ENABLED production
vercel env add SUMMER_GOVERNOR_ENFORCE_ENABLED production true
vercel --prod
```

Before re-enabling enforcement, confirm:

- The governor route receipts are routing to certified tuples only.
- The buffer plan promotions are within the `SYMPHONY_WORKFLOW_CAPACITY` target.
- Every `governor-enforce` action is source-bound, signed, and has an explicit
  `certificationPredicate` and `evidenceRefs`.

If a specific harmful route or buffer plan was admitted, do not replay it.
Instead, correct the source signals (e.g., the closure health projection, the
merge queue projection, the release projection, or the runner projection) and
let the deterministic pipeline produce a new receipt.

## 5. Reconcile ambiguous external effects

If Summer emitted a governor receipt that was later superseded by a different
main SHA or a newer fleet gate, yield and let the newer generation proceed.

If a route receipt was consumed by a downstream worker, verify that the worker's
output matches the certified `RouteReceipt` and `certificationPredicate`. Any
mismatch is an incident, not a reconciliation target.

If the `ovie-summer-bottleneck` channel wrote a repair task that was later
overridden by a human or another automation, inspect the immutable outbox and
choose the source-bound, signed version. Do not reconcile by hand-editing the
outbox.

## 6. Restore / recover data

The Summer governor does not hold persistent user data. It holds durable
receipts, outbox items, and identity packs.

To preserve evidence before any recovery mutation:

```bash
mkdir -p /tmp/jovie-summer-governor-evidence
cp apps/eve-pilot/agent/select-identity.ts /tmp/jovie-summer-governor-evidence/
vercel env ls production > /tmp/jovie-summer-governor-evidence/env.txt
# Copy the relevant durable receipts/outbox items from the configured store.
```

Do not attempt to reconstruct a governor receipt from logs or write one by hand.
The authoritative state is the set of signed, source-bound receipts plus the
identity pack in the deployed commit.

## 7. Verify recovery completion

After flipping back to the desired mode, verify the identity pack:

```bash
cd "$JOVIE_REPO"
pnpm --dir apps/eve-pilot --ignore-workspace run test -- tests/identity-packs.test.ts
```

Confirm all of the following:

- `canGovernorAdmit` is `true` for Summer.
- `canGovernorRoute` is `true` for Summer.
- `canGovernorEnforce` matches the intended `SUMMER_GOVERNOR_ENFORCE_ENABLED`
  value (`true` in enforce mode, `false` otherwise).
- `canPrivilegedWriteGbrain` and `canHealSymphony` are `false` for both
  identities.
- The factory lock assertion passes for both Jovie and Summer.

Also verify the governor route and buffer tests are green:

```bash
pnpm --dir apps/eve-pilot --ignore-workspace run test -- tests/governor-route.test.ts tests/governor-buffer.test.ts
```

## 8. Communicate affected-user scope

If the governor was misrouting or enforcing harmful work, the impact is typically
internal operational delay or an incorrect admission decision. If a certified
policy blocked customer-facing work, the impact may be a service disruption. Post
in `#alerts-critical` using the format from `docs/ON_CALL_PROCESS.md`:

```text
[P0] Summer governor misroute/enforce: <reason>
Status: Investigating | Mitigating | Monitoring | Resolved
Impact: Internal admission delay / possible customer-facing block
Started: <time PT + UTC>
Owner: <name>
Recovery runbook: scripts/symphony/runbooks/summer-governor-recovery.md
Next update: <time>
```

## 9. Audit trail, permissions, and break-glass

- **Who can run this runbook:** On-call operator with deployment access to the
  Vercel environment hosting `apps/eve-pilot` and the Ovie MCP control plane.
- **Audit:** retain the environment variable history, Vercel deployment logs,
  and the immutable Eve receipts/outbox. The identity pack and tests provide a
  reproducible mode check.
- **Break-glass:** if the Vercel API or deployment pipeline is unavailable, the
  governor mode cannot be flipped safely. Escalate to the owner of the Vercel
  account and the GitHub repository.
- **Safety invariant:** never enforce a policy that is not source-bound, signed,
  and covered by a green governor test run.

## 10. Runbook freshness and stale-command checks

This runbook is automatically validated by
`scripts/symphony/lib/__tests__/summer-governor-recovery.test.ts`. The test
checks that the runbook contains the required recovery sections and that every
repo-relative path it references exists.

When you change the following files, update this runbook and the test together
in the same PR:

- `apps/eve-pilot/agent/select-identity.ts`
- `apps/eve-pilot/agent/lib/governor-route.ts`
- `apps/eve-pilot/agent/lib/governor-buffer.ts`
- `apps/eve-pilot/agent/channels/summer-shadow.ts`
- `apps/eve-pilot/agent/channels/summer-bottleneck.ts`
- `apps/eve-pilot/agent/instructions.md`
- `apps/eve-pilot/identities/summer/instructions.md`
- `apps/eve-pilot/tests/identity-packs.test.ts`
- `apps/eve-pilot/tests/governor-route.test.ts`
- `apps/eve-pilot/tests/governor-buffer.test.ts`
