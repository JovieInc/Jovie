# Sentry autofix commissioning boundary

Mission: admit authenticated production incidents to the existing repair ladder
without exposing incident content or delegating execution policy to it.
Audience: the Sentry intake owner and the Lane Fix Relay/board owner.

## Current state

Sentry Autofix is **held and uncommissioned**. Its Actions job writes a bounded
receipt and exits 78. It creates no repair task, lease, branch or PR. Shape-valid
`repository_dispatch` data is not proof of the server's Sentry HMAC verification.
No payload flag or environment switch enables execution. The previous executor
is removed under the provider policy. This is a safety stop, not a completed
replacement or production repair proof.

GitHub workflow enablement is separate from source. The workflow was manually
disabled with no recorded runs at the 2026-11-02 inspection. This patch does not
enable it. A merged source change alone does not prove that a hold job ran.

The webhook remains the incident producer; the recurrence workflow remains the
post-deploy observer. The parallel Lane Fix Relay is independently owned. This
workflow's hold receipt does not certify or disable that relay's existing intake.

## Accepted integration requirements

Compose the existing GitHub relay, durable board and approved worker adapters.
Do not add a poller, model action, new credential, account or paid fallback.

1. Authenticate the source through the trusted server boundary or independently
   re-fetch Sentry evidence using its existing credential. A dispatch sender or
   self-asserted verification field alone is insufficient. Validate repository,
   production environment, project, current deployed release and relevant active
   failure. Preserve the root-signature dedupe across Sentry issue IDs.
2. Initial incidents have no PR number/head. The bridge owner must explicitly
   support that source using the existing durable incident/Linear intake. Never
   fabricate a PR failure or pass the incident to a PR-only verifier and treat
   its empty result as success.
3. Read back one durable task and an unexpired worker lease, deduped by repository
   and root signature. Once a PR exists, verify same repository, current head and
   relevant failure and preserve one writer per PR across fingerprints/retries.
4. Route through qualified fx/WorkersAI and subscription Codex adapters. Fail
   closed on missing credentials, exhausted capacity, unavailable adapters or
   substituted providers. No Claude Code/cloud executor or metered fallback.
5. Keep titles, messages, stacks, routes, contacts and other private incident data
   out of public issues, PRs, logs and artifacts. Treat even authenticated error
   text as untrusted data, never shell arguments, executable prompts or policy.
6. Test the actual event validation → durable task/readback → lease → approved
   route path, including replay, stale head, unrelated failure, fork, hold,
   duplicate writer, transport ambiguity, privacy and provider rejection. Run the
   repository's real CI selector with behavior coverage. Then qualify the exact
   installed source and a fresh event; local mocks alone do not commission it.

The Sentry owner changes only its workflow/intake and tests. The relay/board owner
changes its trust schema, claims and wake path; the worker owners qualify their
adapters. No cross-writer commits or cherry-picks. The hold is removed in a
reviewed source change only after the integrated proof above exists. CI, native
merge queue, deployment and post-deploy recurrence each need separate receipts.

Ship now: the explicit hold and provider stop. Re-evaluate when the bridge and
approved adapter owners supply the accepted initial-incident contract and exact
installed integration proof. Then replace the hold through the existing relay.
