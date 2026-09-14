# Existing repair finalization — JOV-5853

The contained worker cannot push. The existing host consumer must deliver its
result commit, then observe the existing required checks on that exact commit.
This is an extension of the current repair executor and reconciliation cycle;
it does not introduce a controller, scheduler, work ledger or worker retry.

## Current supported recovery

The host persists the worker result before querying GitHub. A missing event,
pending check or restart returns a bounded hold and reuses that result under the
same issue lease. It never spends a second provider turn. A read-only check may
continue during a later new-work or push hold. Missing host push is named
`owned-repair-host-push-required`; unresolved checks remain pending until the
assignment deadline, then produce a failed outcome. A crash between terminal
receipt writes resumes the already observed result without claiming a new one.
Check retrieval binds its response head to the inventory head; a different head
cannot supply success evidence.

These recovery changes do not implement or authorize the missing host push.
The following boundary was accepted by the existing sprint coordinator. The
commissioning implementer owns its implementation; the company credential owner
owns activation. Keep JOV-5853 uncommissioned until the actual signed loop works.

## Required activation action

Identify or provision a company GitHub App installation credential scoped to
`JovieInc/Jovie`, with repository contents write and pull-request/check/status
read access. Supply it through the approved host credential mechanism. Gem's
personal broadly scoped GitHub login is not an acceptable autonomous credential.
Neither the credential nor Summer signing keys may enter worker mounts,
environment, prompts or logs. Do not change company/product credential ownership.

The operator must approve one existing, allowlisted repair assignment with all
of these concrete fields before activation:

| Binding | Required value |
| --- | --- |
| Decision and assignment | Exact signed task key and assignment digest |
| Target | Existing repository, PR, issue, owner and issue revision |
| Destination | Exact preallocated repair branch and expected remote SHA |
| Result | Locally observed commit SHA from the admitted checkout |
| Scope | Exact permitted paths and a bounded change limit |
| Credential | Approved company installation identity and current permission receipt |
| Lifetime | Issue time, expiration and explicit revocation source |
| Finalization permission | Explicit permission to finish this already admitted repair during a new-work hold |
| Safety limits | No main/integration/arbitrary-ref push, force push, merge, grant creation, enrollment change or emergency-stop override |
| Verification | Existing required check identities on the result SHA and a bounded deadline |

This table is a prepared approval contract, not an accepted runtime grant schema
or a fabricated grant. Missing values remain missing. No task is invented to
fill the table. Subscription capacity does not authorize finalization.

## Host push implementation boundary

Re-read the explicit grant, revocation/security state and independent repair
push admission before each side effect. Verify the result ancestry and permitted
paths without executing worker-controlled Git hooks or configuration. A normal
non-force push may update only the exact allocated ref when its current remote
SHA matches the expected SHA; unexpected drift must hold for its existing owner.

Persist push phases under the existing task/result identity. After uncertainty
or restart, first reconcile the actual remote SHA; never infer delivery from a
local command exit. An accepted push starts check observation and is not a
verified outcome. Reuse the current consumer's event/reconciliation path to
observe success, failure or deadline expiry and report it to Summer. Verify
Summer's acceptance and subsequent action separately from host success.

Before live activation, regression coverage must exercise remote drift, a crash
before and after push, duplicate delivery, revoked/expired grants, child-key
exclusion, stale-head checks and a legitimate out-of-policy request. Existing
fixtures and this document do not prove production commissioning.
