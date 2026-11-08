# Cheap fixer source foundation

Mission: reduce mechanical PR repair cost through an approved, measured first rung.
Audience: fleet operators commissioning the existing Lane Fix Relay.

## Supersession — 2026-11-02

The October 24 Gateway backend decision is superseded by the current routing
restriction: no paid Vercel AI Gateway/Jev calls and no Claude Code fixer route.
The previous entry point and paid credentials have been removed. This PR lands
only the pure failure classifier, bounded search/replace patch guards, offline
verdict contract and a dormant entry point that emits a terminal receipt.

Default mode is off. Explicit shadow mode emits `backend-unconfigured`; even a
legacy `MODE=push` cannot make model, GitHub claim or publication calls. The
workflow receives no model or write credentials and obtains no app tokens.
It only runs when the repository explicitly selects shadow metadata recording.
No runtime repair capacity, green PR or realized savings is claimed.

## Adoption boundary

Compose the existing Lane Fix Relay, board and routing.json rather than adding a
second controller. Use the approved Vercel fx harness with Cloudflare Workers AI
credits after verifying the existing install, endpoint, model and credential
boundary. The current source does not install or activate that backend. Existing
Codex subscriptions remain the escalation rung. Commissioning is tracked with
JOV-10359; reconcile the overnight owner before implementing it.

Activation requires ten matched dirty PRs, measured success/rework/cost/time
against Codex, at least 70% success and no rework spike. Keep shadow mode unless
that evidence passes. Record event→claim→push→green→merge timestamps keyed by PR
and head and publish p50/p95 through the existing scoreboard. Every fix retains
its failure fingerprint, cause, guard, successful rung/model, cost and time.

## Offline contracts

- Failure classes: format, lint, typecheck, snapshot, generated and test.
  Metadata, infrastructure and unknown failures stay with the existing relay.
- Search text must match exactly once in a shown file. At most three files and
  60 changed lines; reject protected paths, suppressions and weakened tests.
- The pure patch-verdict contract can reject a candidate. It is not a live judge,
  publication authority or evidence of CI success.
- Terminal receipts retain schema `jovie-cheap-fixer-receipt/v1`, event identity,
  requested and actual mode, start/terminal timestamps, attempted=false,
  pushedSha=null and no model usage. Cost zero describes this no-call receipt,
  not future model economics or realized savings.
