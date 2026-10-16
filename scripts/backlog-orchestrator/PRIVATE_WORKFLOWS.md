# Private workflow intake and recovery

Classify the request before task tools, issue search, or coding-agent dispatch:
`personal`, `jovie`, or `mixed`. Unknown scope and conflicting personal/company
signals use `mixed`. Personal and mixed work denies externalization. A company
source URL cannot establish company scope. Classification is conservative;
company engineering requests mentioning personal operations remain private until
the operator supplies a separate company-only implementation request.

The conversation intake command enforces this boundary before Linear/cache
access. It uses a private file rather than inline evidence in process arguments:

```sh
node scripts/backlog-orchestrator/backlog-orchestrator.mjs reconcile-conversation --evidence-file=/absolute/private/request.json
```

Keep that input outside Git with owner-only permissions. Do not include phone
numbers, credentials, login codes, transcripts, or session files in company
issues, PRs, GBrain, or coding-agent prompts. `externalizeConversationRequest`
denies private requests. For company requests it emits only sanitized title,
intent, summary, and description; raw evidence links and other context fields
are omitted. Sanitization is defense in depth, not permission to publish private
content. Company intake still needs a conversation receipt ID or URL, retained
only as a hashed idempotency marker.

Private records live in `~/.local/state/jovie/private-tasks`, directory `0700`,
files `0600`, outside Git. `--private-state-dir=/absolute/private/path` selects a
different dedicated directory; use the same path on every restart. Separate
accounts use separate directories. Telegram inbox cleanup/archive wording maps
to one task regardless of session IDs. Other workflows should supply a stable,
non-secret `privateTaskKey`. Replays update the same atomic record. Dry runs
create no state and consume no escalation budget.

Only these `recovery.prerequisites` booleans persist: `apiCredentialsAvailable`,
`dependenciesReady`, `phoneAvailable`, `sessionAvailable`. Load the private
record and authorized account configuration before asking for setup. Omitted
facts preserve prior values; explicitly verified changes may update them.
This record contains no credential values. Telegram account/session storage
remains owned by the [Telegram tool](../telegram-archive/README.md).

`recovery.blocker` is one of `authentication_required`,
`destructive_confirmation_required`, `login_code_required`, `phone_required`,
`prerequisites_missing`, `session_revoked`, `two_factor_required`, or
`verification_required`. The private record contains its exact non-secret
description, owner (`tim` or `operator`), next action, and retry budget.
Known phone setup cannot be replaced with another phone request. No blocker
implies `verification_required`, never success.

Authentication and destructive-action blockers produce one
`notify_tim_privately` escalation receipt. The operator conveys it in Tim's
private session. Its issuance is durably recorded with retry budget zero;
replays and changing authentication stages do not prompt again. The guard
does not send messages, authenticate, authorize destruction, or perform account
actions. Later runs wait for private owner action or verification evidence.
The stdout receipt contains only an opaque task ID, scope, status, mutation,
and escalation disposition. Recovery details stay in the private file.

Telegram completion requires `recovery.verification.reportPath` pointing to the
private Telegram tool's report: completed live run, archived-results array,
and a positive Saved Messages delivery ID. Dry runs, failures, and missing
delivery stay blocked. This checks the local result/delivery receipt; it is not
a fresh account readback. Other private workflows retain an explicit blocked
receipt until their result can be verified. A request's claimed status is never
completion proof.

Concurrent writers fail closed. If a process crashes while holding the task
lock, the operator checks the writer is no longer running and reconciles its
private record before removing only that task's lock. Never delete the record
or reset escalation history to recover. Malformed input/state produces a safe
blocked CLI receipt with owner, blocker, retry budget, and next action; parser
errors never echo private input.

EVENT: personal and mixed work remains private by default. No new service,
model call, scheduler, or recurring cost is introduced.
