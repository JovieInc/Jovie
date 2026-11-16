Reviewed 2026-11-16. This JOV-8741 slice makes source selection depend on owner certification and completed jobs. It adds receipt reconciliation to [the existing compiler](outcome-compiler.ts); execution remains disabled.

## Demand and ownership

[JOV-6259](https://linear.app/jovie/issue/JOV-6259) owns the outcome-to-primitive compiler. Tim's authenticated founder requests there and in [JOV-7140](https://linear.app/jovie/issue/JOV-7140) establish the demand: useful creator conversations, current Presence, and accurate music findings. This is founder demand, with no inferred external customer count. [JOV-8741](https://linear.app/jovie/issue/JOV-8741) owns canonical-owner fulfillment and the source canary; JOV-7140 retains the full music mission.

Reuse ownership: [JOV-4496](https://linear.app/jovie/issue/JOV-4496) owns the consented profile registry; [JOV-2919](https://linear.app/jovie/issue/JOV-2919) owns registry consolidation; [JOV-8331](https://linear.app/jovie/issue/JOV-8331) owns catalog qualification; [JOV-7363](https://linear.app/jovie/issue/JOV-7363) owns shared Connections with account separation; [JOV-7315](https://linear.app/jovie/issue/JOV-7315) owns capability-event research; [JOV-3942](https://linear.app/jovie/issue/JOV-3942) owns skill lifecycle. Their status labels do not prove runtime behavior. Existing [connector manifests](../connectors/registry.ts) and [catalog projection](../connectors/artist-profile-catalog.ts) remain canonical. No provider-specific issue, registry, watcher, governor, or UI is added.

[The contract](outcome-contract.ts) accepts immutable certification and outcome references through `compile_outcome`. Owners submit material research, demand, source-policy, revocation, deletion, or outcome changes for reconciliation through the [existing Summer OIDC endpoint](../../app/api/internal/ovie/summer-company/demand-allocation/route.ts) and CAS ledger. This slice adds no polling sweep or delivery mechanism. Stable gap identity coalesces repeated demand; immutable receipt IDs reject conflicting replay in the retained window. A stable domain `jobId` coalesces webhook/backfill deliveries. The source owner remains responsible for durable event identity outside that window.

Certification binds tenant, subject, primitive/version/kind, exact supplier digest, canonical owner, operation authority, build SHA, and validity window. All five named tests must pass: tenant isolation, revocation, replay, failure recovery, and unsupported states. A reference or `pass` label does not run tests, verify its linked artifact, or independently authenticate the claimed owner. The authenticated canonical owner must supply truthful, exact-build evidence. Changing a supplier policy/version invalidates its dependent certification; independent primitive/supplier receipts remain usable.

An accepted completion must match the certificate's supplier, operation, build, and time window. A source fact must link the outcome's evidence reference. Only certified `read` or `sync` completions can validate a source fact. `draft` and `send` remain distinct authority; none grants execution. Source freshness, consent, privacy, and terms still govern selection. Partial, failed, unknown, revoked, deleted, and unsupported outcomes stay explicit. Current supplier snapshots can invalidate retained historical receipts. Revocation/deletion receipts also form a durable barrier: an old available snapshot or delayed completion cannot restore use until the owner certifies again after that invalidation and a new job completes under that certificate.

[The fulfillment projection](outcome-fulfillment.ts) counts unique attempted jobs and correct completed jobs in the retained evidence window. Job receipts carry cumulative cost, including retries, maintenance, and review. Failed jobs remain in total cost; the highest cumulative cost per job survives reordered or lower-cost replays. Cost per successful outcome is null when there are no accepted successes. Accepted successful jobs also report measured latency p50/p95/n; an empty sample is null. Equal-time ambiguous receipts cannot create a success. The compiler applies the existing correctness, freshness, latency, and economic floors to realized work. These are Jovie job-operation measurements, not invented provider audience metrics. Each primitive retains at most 100 receipts of each kind. Overflow advances a durable `receiptFloor`; receipts and certificates at/before it cannot restore source truth. New invalidation events still commit. Owners must certify again after the floor before reuse. This is a storage bound, not provider quota or complete lifetime measurement; independent primitive windows stay unaffected.

## Bounded YouTube acceptance input

YouTube is an existing implementation candidate named by JOV-8741, not a newly supported network. Its [inbound adapter](../connectors/youtube/inbound-comments.ts) and [draft mapper](../connectors/youtube/sync-inbound-comments.ts) already exist. This receipt slice neither invokes them nor certifies their live operation. The current compiler remains `presence.profile-current/v1`; comment signals need their existing Inbox/Audience owner's supported contract before runtime admission. X remains restricted. Customer publishing approvals and disabled reply sending remain in force; connection consent is not permission to publish.

Official evidence checked 2026-11-16:

- [OAuth scopes](https://developers.google.com/identity/protocols/oauth2/scopes#youtube): minimize method-specific read grants; broad `youtube.force-ssl` includes comment/video modification.
- [Revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke) can invalidate combined project grants; stop local dependent work immediately.
- [Data policy](https://developers.google.com/youtube/terms/developer-policies) governs consent, token revocation, deletion and refresh deadlines; the source owner implements that lifecycle.
- [Comment threads](https://developers.google.com/youtube/data/reference/rest/v3/commentThreads/list) cost one unit per page (up to 100 threads). [Quota rules](https://developers.google.com/youtube/data/determine_quota_cost) also charge invalid requests and extra pages. Measure actual project usage.

Runtime admission under JOV-8741 requires existing owners to account for actual quota, title batches, cache freshness, event debounce/coalescing, backpressure, Retry-After, and bounded recovery. No new source access or spend is authorized.

## Source canary and remaining acceptance

[Source tests](outcome-fulfillment.test.ts) and the [durable canary](outcome-fulfillment-durable.test.ts) exercise synthetic unmet demand (`internal-synthetic`) -> one deduplicated primitive gap -> economic trial decision -> exact adapter-test certification -> matching use/outcome receipt -> known fact and successful-job cost -> revocation/failure invalidation or recovery. They also exercise CAS persistence failure, concurrent replay, tenant boundaries, authority separation, and affected-capability invalidation. Fixtures prove the receipt integration; they are not a real adapter run or customer completion.

Local tests/coverage, hosted CI, deployment, and provider/customer runtime are separate evidence layers. This document is source evidence only. JOV-8741 still owes a permitted live source -> supported signal -> eligible Inbox/Audience proposal -> approved outcome with durable exact-deployment receipt. JOV-7140 and JOV-8331 retain their actual mission/catalog acceptance; no live proof is implied.

**Ship now:** the disabled receipt integration through ordinary CI/review.
**Re-evaluate when:** canonical owners provide fresh authorized runtime receipts,
or source policy, access, quota, or useful-outcome economics changes.
**Then:** reconcile only affected capabilities through the existing loop; retain,
replace, or retire the route against correct completed jobs and full cost.
