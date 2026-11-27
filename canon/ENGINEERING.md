# Jovie Engineering Canon

Status: Canon
Inherits: [`OPERATING_SYSTEM.md`](./OPERATING_SYSTEM.md)
Last updated: 2026-07-17

Engineering exists to increase company throughput by making the product correct, shippable, reliable, and easy to change.

---

## Engineering Optimization Order

Optimize in this order:

1. Correctness
2. Developer velocity
3. Reliability
4. Cost
5. Latency
6. Elegance

Never reverse this order without evidence that the lower item is the current bottleneck.

---

## Engineering Proposal Gate

Before starting engineering work, answer:

- Current bottleneck:
- Evidence:
- User/company metric affected:
- Smallest correct change:
- Verification command or production receipt:
- Rollback path:

If the work does not remove the bottleneck, do not do it unless it is a small, clearly correct safety fix.

---

## Default Technology Posture

Prefer boring technology. New technology is adopted only when it removes the current bottleneck.

Default stack remains:

- PostgreSQL
- TypeScript
- Next.js
- Supabase
- Upstash
- Stripe

Use upstream/open-source projects when they compound our work and reduce maintenance, but only through a bounded, reversible adoption path with evidence. Track upstream when that lets Jovie benefit from others' development work without surrendering control of the bottleneck.

---

## Capability sourcing and IA integration

<!-- JOV-INV-044; policy version 1; JOV-6212 -->

Minimize lifetime ownership of undifferentiated mechanisms, subject to required
correctness, security, reliability, privacy, performance and user experience.
Custom product behavior is expected; custom commodity mechanisms require evidence.
Dependency count and lines of code are not goals. This is the single sourcing and
planning authority; scoped rules, task packets and review project it.

1. State the user outcome. Classify each consequential capability as
   **differentiating product logic**, **necessary integration**, or **commodity
   mechanism**, with its canonical implementation, scope, owner and runtime.
   Calling auth or PDF generation proprietary does not change the mechanism.
2. Before new or materially expanded commodity work, inspect current code and
   dependencies, platform/standard-library features, official vendor integration
   and plugin indexes, and credible maintained OSS/services. Record authoritative
   sources, exact versions/configuration, licenses and checked dates. Search order
   is a heuristic, not a preference for vendors or new dependencies. An applicable
   canonical implementation needs no three-candidate exercise.
3. Reuse current scoped decisions. Renew when requirements, versions, workload,
   security assumptions, cost or material regressions change, including external
   capabilities that falsify an assumption (JOV-7339). Framework adoption cannot
   indefinitely grandfather bespoke sub-capabilities.
4. Consider reuse, configuration, adoption, purchase, extension, upstream
   contribution, fork and build. Custom/fork choices identify an unmet hard
   requirement or demonstrated material net advantage over the best credible
   alternative, including narrow adaptation. Compare lifetime integration,
   maintenance/security updates, infrastructure, review/incident, migration and
   opportunity costs. No protected quality/security floor may regress. Forks name
   upstream/license, patch scope, update owner and exit trigger.
5. One authoritative implementation per capability and scope. Thin adapters
   implement Jovie's actual contract; do not replicate an SDK or invent universal
   abstractions. Installed-client compatibility names versions and retirement
   criteria. Small pure helpers need neither a package nor full sourcing research.
6. Provider-owned lifecycle state is authoritative: consume official
   list/update/delete/revoke/recovery APIs and native management surfaces where
   they satisfy the job. Local pending/UI state is provisional and reconciles
   before claiming setup completed. Parallel persistent flags/state machines
   require a documented provider gap, bounded delta and exit trigger. JOV-6892:
   starting a 1Password ceremony never proves registration; cancellation must
   reconcile to no credential and a recoverable setup path. Before auth repairs,
   check installed Better Auth, its official integration/plugin index (including
   Electron), SimpleWebAuthn/platform contracts and supported endpoints/hooks.
7. Routine adoption within existing security/license/budget authority proceeds
   autonomously. Paid commitments, data disclosure, credentials and external
   authority retain applicable authorization; routine PR and Linear text is not
   data disclosure ([routine writes](FLEET.md#routine-writes)). Missing network/package access
   routes to bounded research or trusted dependency preparation; it never proves
   no SDK exists or authorizes a rewrite. Keep unrelated delivery moving.
8. Verify the same behavior/failure/security contract for incumbent and candidate.
   Source strings, symbols and SDK presence are structural evidence only. Auth
   outcome proof includes authoritative registration/list/delete, cancellation,
   timeout, denial, dismissal, recovery and retry. Integration remains Jovie's job.
9. Evidence and exceptions bind requirements, dependency/config versions, policy
   version/digest, repository and relevant exact head/diff. Independent review
   compares diff semantics to the decision and verifies citations. An author
   cannot approve their exception, relabel protected infrastructure, weaken a
   checker or enlarge an allowlist to authorize their change. Existing review and
   governance owners use trusted base policy; no blanket founder merge gate.
10. Apply to new/expanded decisions proportionately. Existing SDK use, pure
    helpers, routine bug fixes and docs need no redundant research. Incident
    repair uses existing emergency authority without lowering security, recording
    a bounded follow-up. Legacy mechanisms do not trigger a wholesale rewrite.

### One surface per product

<!-- founder decision 2026-10-28: one Ovie -->

A new surface for an existing product extends that product's shared shell. It
does not create a parallel app, repository, native rewrite or second shell
(agents once built several Ovies; only the web Ovie at `/app/ov` survives).

- `canon/product-surfaces.json` registers every `apps/*` directory with a kind
  (`shell`, `deploy-boundary`, `wrapper`, `independent`). `independent` needs a
  written justification; anything else extends an existing shell.
- The same file lists forbidden parallel implementations and retired
  repositories per product. `pnpm run surfaces:check` (also in
  `invariants:check`) fails on an unregistered app, a tracked forbidden path
  (for example Swift Ovie) or a retired repo left in the ownership, release
  communications or closure-health registries.
- Plans that add a repo or app must name the shell they extend in the IA
  preflight below; "new repo" is not an answer to "where does this live".

### Native / web / Electron boundary

<!-- Project Swift; projects capability sourcing + product-surfaces + Mac ADR -->

Choose the **thinnest client that still delivers the user job**. Stack fashion
is not a reason. This section is the single client-boundary authority; Mac ADR,
iOS/macOS rules, and decision records project it. Applied receipts:
[`docs/architecture/native-web-electron-decisions.md`](../docs/architecture/native-web-electron-decisions.md).

**Favor native** when it materially improves latency, platform UX, credentials
(Keychain/Secure Enclave/biometrics), notifications, files, media capture,
HealthKit/background work, or accessibility/input conventions the platform
owns. Core daily loops (sign-in, home/shell, chat type/send/stream, onboarding
profile completion) belong native on installed clients unless a dated receipt
proves otherwise.

**Retain web (or Electron wrapping hosted web)** when total ownership cost is
better: content/admin/infrequent surfaces, Stripe Customer Portal and legal
docs, dense long-tail workspaces without a native IA, or a single hosted engine
that must not fork (example: public-profile playback). Electron on Mac remains
the shipped product shell until the accepted native cutover in
[`docs/macos/ADR-swift-native-mac.md`](../docs/macos/ADR-swift-native-mac.md);
new Mac product surfaces default to SwiftUI, not new Electron chrome.

**Shared layer stays server-authoritative.** Entitlements, billing state, action
policy, auth verification, and health/safety dispositions are owned by shared
server contracts. Clients present and collect; they do not invent a second
business-rule implementation. One Ovie remains web on the shared shell
(`canon/PRODUCT.md`); do not grow a native Ovie.

**Evidence before migration.** Inspect the current experience and code first.
A rewrite needs a measured user problem, a named owner/runtime, rollback, and
what the old path retires. Source checks are not installed-app proof. Broad
native or web migrations stay blocked until a decision record exists.

**Decision record (required for each meaningful boundary change):** user problem
+ evidence; why chosen impl; API/auth/nav/state boundary; compatibility/fallback;
migration/rollback; what can be retired; what would justify revisiting. Ship the
record with the PR that changes the boundary; extend the decisions file rather
than inventing a parallel doctrine.

**Ship now:** this policy and applied receipts for existing surfaces.
**Re-evaluate when:** a measured journey shows native/web mismatch costing
activation, trust, or ownership (hangs, auth failures, stranded deep links, or
duplicated business rules). **Then:** update the matching decision record and
cut over only with rollback.

### IA preflight for UI-bearing plans

**Integrate > consolidate > replace > extend > add.** Before implementation,
inspect the current mounted surface/source and relevant Pen/design/interaction
owners. Reconcile the user job, canonical surface/owner, absorbing control/object
model/action registry/workflow, replacements/obsolete UI, duplication from simple
appending, smallest native IA change, and existing generic primitives. Account for
empty/loading/error/no-data states, high density, authoritative design target, UI
being deleted/merged, and why any genuinely new surface cannot fit existing IA.
An "add button/section/page/panel/tab" plan alone is incomplete.

Every touched surface records one disposition: **no new surface**, **surface
replacement** (what is removed), **surface consolidation** (what merges), or
**new surface justified** (evidence plus independent review). Any added visible
control/row/card/filter/menu item/settings entry/route/panel/tab/section is UI
impact. Record before/after visible controls, first-level actions, groups,
tabs/routes/panels, duplicate concepts and measurable scroll/density burden.
Explain growth; reviewers challenge missed consolidation. Capability should grow
faster than interface complexity. Compare the actual diff to the disposition:
new concepts, duplicate jobs/actions across levels, obsolete UI, implementation
taxonomy and scroll-forever surfaces are findings unless explained.

Reuse JOV-5946 (surface evolution), JOV-6220/JOV-6942 (certification),
JOV-7074/JOV-5429 (menu/interaction owners), JOV-3541 (ratchet), and
[DESIGN.md](../DESIGN.md). Settings JOV-3848, Ovie JOV-6895 and Work
JOV-7471/7473/7474 are deliberate regression cases. Work's target is Overview |
Files, actual file objects with roles as metadata, one primary Add, no permanent
empty media buckets or duplicate artwork/audio actions. This policy does not
attest that those product changes have landed.

### Decision receipt and rollout

Extend the existing issue plan/workpad and PR evidence with `planningDecisions`
inside a JSON fence; carry it through handoff/compaction with its decision
references and unresolved evidence. See the executable field contract in
[`capability-planning.mjs`](../scripts/invariants/capability-planning.mjs).
No second ledger, skill tree, catalog, service, scanner or market sweep.

The receipt records outcome, capability/scope/classification, owner/runtime,
hard requirements and existing implementation/decision; authoritative alternatives
with versions/date/license; disposition and bounded delta/rejected alternatives;
lifetime cost/risk, tests and evidence kind; rollback/retirement/re-evaluation;
requirements/assumptions/config and policy/source binding; independent exception
review. Its IA rows record the preflight above. An empty sourcing/IA list means
unaffected work, subject to semantic review; it is not a self-authorization.

Ship now: policy, packet integration and **nonblocking diagnostics** only.
Missing evidence yields a bounded research task (research-ready), not a parked
issue. Structurally complete evidence is only an implementation candidate until
independent evidence/semantic review; fabricated citations and unverified facts
never become verified through field validation. Classifiers are advisory risk
signals and cannot detect every custom mechanism or UI addition.

Re-evaluate when: multiple representative actual adoption/custom/docs/incident
ships and Settings/Ovie/Work/passkey cases have source-bound receipts. The existing
review/governance owner must record false positives, missed violations, pass rate,
p95 qualification duration, throughput, runner cost and failure isolation. Proposed
initial cohort: three ships per workload class, zero unexplained misses/false
blocks, p95 diagnostic time below one second and no extra runner allocation;
these are proposals, not founder-approved thresholds.

Then: existing authority may promote only qualified narrow deterministic checks
with a tested rollback to prior qualified delivery. LLM/source classification
stays advisory. Existing CI/security/license/import/path gates remain enforced;
no live web search runs in synchronous PR gates. Local fixtures prove diagnostic
behavior, not agent compliance, hosted CI, shadow qualification or product runtime.

---

## Shared capability behavior

EVENT: Founder direction, 2026-11-26; implementation scope JOV-11840. The
launch/task standards apply to every relevant product capability. JOV-5943's
quality contract, JOV-5946's completeness contract, JOV-6190's executable
examples and JOV-7985's adoption loop remain the owners. This standard does not
certify existing consumers, select a new data vendor, or create another registry,
scheduler, ledger or operation framework.

### Canonical outcomes and authority

Meaningful durable actions and authoritative reads belong to one typed,
versioned domain contract. Web/native UI, conversation, authorized agents, API,
CLI and MCP are adapters over its state and audit trail. Cover inspection,
creation, change, movement, assignment, completion, reversal and recovery where
applicable. Use the existing Action manifest/completeness overlay and domain
write registry. An agent inherits the actual principal's current scope,
entitlements, confirmation rules, quotas and budgets. Required human, device and
provider ceremonies remain explicit prepare/start/resume handoffs.

A successful write receipt means the stated result committed. Persist the
logical command identity, actor/resource scope, payload binding and resulting
revision. An identical replay returns the original semantic result; changed
intent under that identity conflicts. Accepted or pending work is distinct from
committed work. A later refetch cannot repair an earlier false-success claim.
Concurrent changes use revisions or documented intent-preserving conflict
semantics. Coupled state, durable result and pending event commit atomically
when partial application would violate the job. Stale clients and delayed
agents cannot overwrite newer decisions or complete obsolete work.

### Apply the requirements to the actual operation

| Operation class | Required behavior and evidence |
| --- | --- |
| `local-transient` | Immediate local feedback, accessibility and coherent pending state. A local filter does not need a durable job or provider settlement. |
| `durable-write` | Canonical authority, truthful committed receipt, replay/conflict handling, revision/concurrency protection and authoritative recovery/readback. |
| `external-effect` | All applicable durable-write requirements plus persisted effect intent, current dispatch authority and provider settlement. Record both classes. |
| `continuation` | Durable accepted attempts with real owners, leases/fencing and continuation state; bounded retries/deadlines; restart and missed-event recovery independent of the missing event; output evidence and useful attention. |
| `human-handoff` | Evidence of the required human/provider completion boundary, recoverable resumption and useful attention. Preparation or silence cannot stand in for the person's action. |

Classes compose. Apply them to the scoped job rather than imposing durable
machinery on every interaction. Media/streaming distinguishes acknowledgement,
first useful output and completion. Preserve the existing responsiveness
defaults in `JOV-INV-027` and stricter route contracts. Local pending feedback
must not claim payment, publication, authorization or external completion.
Scoped reads, targeted invalidation and incremental updates must converge after
permission changes and deletion; stale/partial data cannot prove current health
or absence. Safe offline persistence needs its own qualified evidence.

At external dispatch, recheck current authority, scope, revision, budget and
attempt. Use provider idempotency and destination readback where available.
Reconcile a lost acknowledgement before replay. Without reliable lookup or
idempotency, leave an ambiguous effect unresolved rather than reissue it.
Internal fencing cannot recall a provider request already sent.

Jovie stewards every commitment, including tasks a person assigns to themselves.
Prepare useful human actions, advance eligible work, reconcile evidenced
completion/duplicates/obsolete state and route technical recovery. Reminders
are useful and deduplicated. Age, inactivity or an unanswered reminder cannot
erase a valid commitment or prove completion. Bring consequential unresolved
choices to the appropriate person with evidence and a recommendation. An empty
interface is not evidence of healthy progress.

Reusable methods/templates use accepted versions, scoped inheritance and
preserved active-run overrides; authority resolves for the actual run. Use
deterministic upkeep for known cases, coalesce unchanged reads/events and measure
full cost per useful outcome. Waiting alone must not trigger repeated model or
network work.

### Evidence and adoption

The existing `QualityContract` may carry `operationEvidence` rows naming the
canonical `operationId`, matching contract `surface`, applicable `classes`,
exact `sourceRevision`, and requirement-keyed `evidence` references. The
requirement vocabulary lives in `JOV-INV-027.policy.value.operationEvidence`.
Compiled, adversarial examples are in
[`quality-ratchet.test.mjs`](../scripts/invariants/quality-ratchet.test.mjs).

The existing validator reports **unknown**, **source-proven** and
**runtime-verified** separately. References and author assertions alone remain
unknown. A trusted adapter from the existing evidence/certification owner must
independently resolve each reference, validate authenticity/freshness and match
the operation, surface, requirement and exact source. Runtime evidence also
binds the environment and deployment: one such context must cover every
applicable requirement, and the report names that context. Passing proofs from
different contexts cannot be combined into runtime verification. The evaluator
does not run or replace that verifier; its default performs no network reads and
verifies no references.
Missing applicable receipt, recovery, effect or human-boundary evidence cannot
produce runtime verification. Source proof is not deployment or publication
proof, and this diagnostic never grants product certification.

Responsiveness-only contracts retain their existing scope and checks. Absent
operation metadata is **unassessed**, not inapplicable or certified. The report
explicitly covers declared contracts only and never claims the app-wide
inventory is complete. JOV-7985 reconciles the affected-consumer denominator
through the existing canonical identities and records verified, needs migration,
valid scoped exception, legitimately inapplicable or unknown coverage. Preserve
incumbent owners and deduplicate bounded repairs.

**Ship now:** this normative standard, optional evidence metadata and
failure-isolated shadow reporting in the existing invariant validator. Existing
quality floors, required gates and legacy protection remain enforced; new
diagnostic findings do not block otherwise qualified delivery.

**Re-evaluate when:** affected consumers have exact source/deployment outcomes,
deliberate-red and neighboring-green proof, and representative actual-ship
measurements of correctness, qualification duration, throughput, cost and failure
isolation. **Then:** existing governance may promote qualified narrow checks for
changed consumers and affected shared primitives, with rollback. Documentation,
fixture success or agent assignment alone never establishes adoption.

---

## Shipping Rules

- Smallest correct change.
- One concern per PR.
- Draft PR early to start feedback.
- Merged is not done until production outcome is verified.
- A green local check is evidence, not completion.
- CI, migration guards, security gates, and production verification are not optional.
- Two pull-request checks inside Source Validation fail `PR Ready` with no feature flag. Security Evidence runs `actions/dependency-review-action` (pinned by commit SHA, `.github/dependency-review-config.yml`) and fails an added or upgraded dependency with a high or critical vulnerability or a GPL/AGPL-family license. Migration Guard runs Squawk 2.70.0 (pinned by version and sha256, `scripts/db/squawk.toml`) on Postgres migration SQL the pull request adds or changes. Unchanged migrations are not linted. Do not lower either check to advisory. Scheduled osv-scanner and Trivy scans stay beside dependency review, and `validate-migrations.sh` stays beside Squawk. These two checks are blocking because this change required a hard fail. Apply the shadow-first rule below to every other new gate.

---

## Agent Engineering Rules

### Qualify delivery gates in shadow before enforcement

EVENT: Founder direction, 2026-09-09. Across every company product and
repository, a new or changed CI/delivery requirement that could stop shipping
must first run alongside existing delivery as a nonblocking qualification. Keep
existing required gates enforced. A new diagnostic evaluator reporting red must
not freeze otherwise qualified shipping.

Before promotion, record a representative cohort of multiple actual ships,
correctness and qualification pass rate, p95 qualification duration, throughput,
runner/cost impact, and failure isolation. Pass rate and p95 duration are separate
measurements. Propose explicit workload-specific thresholds and sample sizes;
do not claim the founder supplied a numeric threshold where none was specified.
Promote in bounded stages with an accountable owner and tested rollback. Restore
the prior qualified behavior if a novel gate collapses throughput. Queue tuning
also runs without delaying eligible shipping and must be supported by measured
headroom and reversible trials, not a guessed permanent optimum.

This is global policy, recorded here in the existing engineering canon. A Jovie
documentation change does not establish technical enforcement in other repos.
Each delivery owner must supply its own shadow and promotion receipts; existing
canonical review and governance paths apply this rule without a new control plane.

### Code or skill: thin harness, thick skills

EVENT: Founder direction, 2026-11-09. Jovie chat had grown a 3,265-line route
with about 40 hand-wired tools, several of which only handed the model an
instruction string. Agents shipped prompts as features, and nothing pruned
them. The fix is one rule for what is code and what is a skill.

- **Code** is for what must be deterministic or safe: reading or writing data,
  calling a provider, enforcing a rule (artist rules, plan gates, the copy
  floor), formatting that must be exact (lyrics), and rendering UI.
- **A skill** is for judgment or a method: a strategy, a plan, a playbook, a
  checklist, a tone. It is a markdown file,
  `apps/web/lib/chat/skills/library/<name>/SKILL.md`, with `name`,
  `description` (ending in "Use when ...") and optional `plan: pro`
  frontmatter. Adding one needs no tool, route or prompt edit; run
  `node apps/web/scripts/generate-chat-skill-index.mjs` to refresh the
  precomputed index the prompt reads.
- A tool whose result is an instruction for the model is a skill in disguise.
  The system prompt holds rules that apply to every turn, not feature
  playbooks.
- When Jovie can't do something, it says so and calls `requestCapability`
  instead of improvising. The founder's requests reach Summer as Founder
  priority.
- Every change that adds code to the chat harness removes or merges at least
  as much: tool count, prompt sections and file sizes only go down.

Enforced by `apps/web/lib/chat/thin-harness.test.ts` (no prompt-only tool,
tool and prompt-section ceilings, skill shape) and the size baseline in
`scripts/company-guards/size-baseline.json`. A ceiling is never raised to
fit a change; the change makes room under it.

AI agents should:

1. Observe the bottleneck.
2. Measure or fetch evidence.
3. Make the smallest safe change.
4. Verify with real output.
5. Record the receipt.
6. Stop creating work for humans unless a decision genuinely needs founder judgment.

Agents should not:

- Refactor stable code without measurable benefit.
- Introduce new infrastructure because it is interesting.
- Bypass checks for speed.
- Create bot-to-bot chatter or routine progress noise.

---

## Relationship to Operational Rules

Concrete implementation lives in `../CLAUDE.md`, `../CODEX.md`, `.claude/rules/*`, `docs/PR_FLOW.md`, and tests. Those rules implement this canon. If operational rules conflict with this file, escalate to `OPERATING_SYSTEM.md` and update the lower-level rule.

---

## Changelog

| Date | Change | Source |
|---|---|---|
| 2026-11-09 | Code or skill: thin harness, thick skills, with ceilings enforced by the thin-harness test. | Tim White |
| 2026-10-23 | Blocking pull-request dependency review and Squawk on changed migration SQL. | grok/extra-guards |
| 2026-07-17 | Created as domain canon under `/canon`. | Tim White |
