# Library Content Graph and Artist Rules (JOV-5362)

Status: approved founder direction, implementation in progress

Pen source: `Jovie Library UX Audit.pen`, frames `04 — Unified Library / work graph`, `05 — Artist invariant stack / rule review`, and `06 — Post-release presence / one content card`

## Bottleneck and expected improvement

The current Library separates release/media assets from private ideas and scripts, while YouTube, release distribution, collaborators, thumbnails, and creator memory each expose different slices of the same creative work. A creator cannot answer three basic questions from one surface: what is only an idea, what is being worked on, and what is already out.

Success means one Library read model can answer those questions without replacing the existing source tables. A creator must be able to identify the lifecycle stage of any visible item in one scan, switch stages without losing a draft, and recover an imported YouTube video by title, source, or release relationship. The expected improvement is a single task-led surface where lifecycle, item type, release context, provider identity, and approval state can be filtered independently; imported media and artist rules retain evidence and never create a second graph.

The visible product name remains **Library**. “Assets” is a type filter, not the page name or a peer workspace.

## Tim lock: post-release presence, track first

Founder lock: 2026-08-28.

Library is the track-first post-release presence surface and optimization flywheel. It does not sell licenses, lead with a license request, create a license desk, or treat an email address as a rights grant. The content card is the hero; one selected item is worked at a time. Artist identity is secondary but prominent. The visual contract remains the approved dark Apple / Linear / iOS-native-in-browser system with 32/510 controls, 28/620 titles, splash B, and blue / hot-pink / purple atoms.

Every post-release Library projection contains four bounded primitives:

- `downloads[]`: active email-gated files only after an explicit full-control attestation. Existing promo-download storage, OTP email, file delivery, and usage events remain canonical. No Stripe or new stack.
- `stats`: provider connection state plus real measurements when a wired dashboard supplies them. Until then every DSP/social metric is empty or `Not connected`; zero, streams, revenue, and inferred money are forbidden placeholders.
- `rightsholders[]`: evidence typed `attested`, `observed`, or `claimed`, with composition/master/unknown domain and provenance. Songview and MLC public work shares are always `observed`, never legal title or master points. A file cannot prove every owner.
- `presence`: `repair_queue[]`, `collisions[]`, and placement opportunities. A direct update opens a surface the artist controls or can claim while the finding stays open. Other repairs produce local draft copy only. Nothing sends without Tim's explicit send approval.

`not_this_artist` and `not_this_song` are durable collision outcomes, not ephemeral search exclusions. They constrain later discovery and matching so Peking Duk, Cut Copy, SAFIA, same-name Tim White records, and other rejected identities do not re-enter as silent candidates.

Take Me Over is explicitly excluded from the free-download proof because its observed writers include White, Gibson, and Stallone and there is no complete master-control attestation. The first live-download class is a recording Tim attests he controls 100%, such as Never Say A Word.

## Existing substrate and adopt-first decision

Decision: **extend**, not build.

- Keep creator documents, discography, release credits, release-to-revenue drafts, connector accounts, the YouTube Library, and thumbnail history as canonical owners.
- Extend the existing Library as a read model and the existing YouTube connector/sync seam as the import path.
- Add a creator-policy owner only because raw memory has no typed confirmation, precedence, scope, override, or revocation semantics.
- Do not add a generic asset database, new artist graph, duplicate release registry, new scheduler, or separate Ideas product.
- Compose the onboarding research system from the approved boundary: Exa for open-web entity discovery, Firecrawl for extraction and dead-link checks on known URLs, Cloudflare AI Search plus Browser Run `/crawl` for the per-artist remembered crawl, and typed Songview/MLC API observations. This change activates or purchases none of those vendors.

Revisit this boundary only when a source cannot express a required lifecycle or relationship through a deterministic adapter, or when workflow-backed social drafts need durable editing and analytics beyond workflow retention.

## Product primitives

### Work item

A `LibraryWorkItem` is a read-model projection over an existing canonical record. It owns no media bytes and does not replace the source record.

Required axes:

| Axis | Meaning | Examples |
| --- | --- | --- |
| `kind` | What the item is | release, video, image, audio, text, social, merch |
| `stage` | Where the work is | idea, in progress, out |
| `releaseId` | Optional campaign/release context | Afterglow |
| `source` | Canonical owner and provider identity | creator document, discography release, YouTube video |
| `visibility` | Who can see it | private, team, public |
| `approval` | Whether an explicit decision exists | pending, approved, rejected |
| `archiveState` | Retention lifecycle | active, archived |

`idea` is a stage, never a kind. A script is text. A music video is video. A social teaser is social. Any of them can be an idea, in progress, or out.

### Relationship edge

A `LibraryRelationship` connects canonical records without copying them. Every edge has a typed subject and object, provenance, confidence, review status, creator profile, and optional effective window.

Initial relationship kinds:

- video features merch product;
- video mentions brand;
- content promotes release;
- content credits artist or collaborator;
- content uses tracked destination or affiliate offer;
- provider placement publishes merch product to a YouTube surface.

Detected relationships remain suggestions until the source is authoritative or a person reviews them. Removing an edge removes query context, not the underlying records or evidence.

### Destination, attribution, and experiment

A destination is the canonical outbound target behind a Jovie redirect. An offer adds commercial terms, disclosure requirements, brand, product, and effective dates. An immutable attribution event records the redirect, provider context, campaign, content item, and privacy-safe conversion evidence.

An experiment always declares its subject, variants, objective, guardrails, audience/cohort, exposure window, and decision state. Thumbnail, destination, merch-placement, and content experiments share this contract; they do not share a universal score.

### Release graph

A release is a campaign anchor and natural collection boundary, not a folder and not a generic asset table. Linking an item to a release changes query context only; it never moves or duplicates the item.

The release graph reuses canonical IDs:

- releases and recordings from the discography schema;
- credited artists from `artists`, `releaseArtists`, and `recordingArtists`;
- YouTube videos and release-link evidence from the YouTube Library schema;
- social distribution drafts from the release-to-revenue workflow until they graduate to a canonical social-content owner.

No implementation may create a second artist, collaborator, media, or release registry.

### Artist rule

An artist rule is a typed, confirmed policy derived from creator direction. Raw memory is evidence or a suggestion; it is not enforceable policy.

Required fields:

- category and normalized rule key;
- hard constraint or soft preference;
- scope (artist-wide, channel, release, item kind, or item);
- provenance and confirmation evidence;
- whether lower layers may override it;
- optional effective and expiry dates;
- status: suggested, active, superseded, or revoked.

## Hard invariants

1. Lifecycle, kind, release relationship, visibility, approval, and archive state are independent axes.
2. Source identity is stable. Projections may filter or group; they may not move, copy, or silently replace canonical records.
3. Imported YouTube videos retain channel ID, video ID, provider timestamps, privacy, thumbnails, and append-only metric history.
4. A YouTube video becomes release-linked only through a verified provider identifier, an ISRC match, or a reviewed evidence record. Low-confidence matches remain pending.
5. Collaborator ingest reuses the canonical artist registry and credit joins. A detected name is evidence, not consent, endorsement, outreach authority, or a public relationship claim.
6. Thumbnail versions are append-only. Exactly one version may be current. Candidate, experiment, rollback, measurement-window, and promotion evidence remain queryable after a winner is chosen.
7. A thumbnail winner is derived from a locked objective and minimum evidence, then explicitly accepted. CTR alone cannot automatically declare a winner; watch time per impression is the default quality metric.
8. Raw memory may propose an artist rule but cannot activate one. Activation requires a typed rule, source provenance, and artist or authorized-team confirmation.
9. Rule precedence is fixed:
   `truth / safety / law / platform / active contract`
   → `verified source context`
   → `experimentally validated performance knowledge`
   → `artist hard constraints`
   → `artist soft preferences`
   → `item experimentation`.
10. A lower layer can override a higher layer only when the higher rule explicitly allows it. Every exception records scope, author, reason, evidence, and optional expiry.
11. Archive and hard delete remain separate. Published, ingested, ISRC-linked, analytics-bearing, or uncertain records fail closed to archive.
12. Sync is idempotent on provider identity, bounded by provider pagination, and partial failure is resumable. A failed page cannot delete, unpublish, or demote previously imported records.
13. Imported attribution is evidence-scoped. Title, description, channel metadata, and third-party text may suggest a collaborator, but only a verified provider credit, catalog credit, or explicit review may create a canonical credit join.
14. Artist rules are tenant-scoped to a creator profile. Reads and mutations require exact profile access; activation, exception, supersession, and revocation append an audit event.
15. Disconnecting YouTube revokes future access and scheduled refresh, but retains already imported records and provenance until the artist archives or deletes them under the normal retention policy.
16. Merch worn in a video is a reviewed relationship edge to the canonical merch product. Detection confidence alone cannot publish the tag, create an endorsement, or change inventory.
17. YouTube merch-shelf placement is a provider binding with its own eligibility, publication, sync, and removal state. Jovie never equates a Library relationship with proof that YouTube accepted or displayed the product.
18. Brand mentions, sponsor obligations, affiliate offers, redirect destinations, and conversion events are separate primitives. A mention does not imply a paid relationship; a click does not imply a conversion; attribution must retain its model and window.
19. Optimization consumes eligible, privacy-safe evidence only. Every recommendation names the objective, guardrails, evidence window, sample sufficiency, and affected relationship; no global score may silently trade artist constraints, contractual duties, or audience trust for clicks.
20. Commercial links fail closed on expired terms, missing disclosure, invalid destination, or a blocking artist/contract rule. Redirect history and experiment assignments remain auditable after a destination changes.
21. Library never presents or promotes license sales. Track downloads are a separate, attested giveaway primitive using the existing email gate and delivery stack.
22. Existing promo files fail closed to inactive until the artist supplies immutable full-control attestation with an actor and timestamp. An active download without that evidence is rejected in application and database layers.
23. Unknown stats render `Not connected` or empty. A disconnected provider cannot produce `0`, estimated streams, revenue, or synthetic trend lines.
24. Rightsholder evidence is domain-scoped and provenance-preserving. Songview/MLC can observe composition claims only; neither upgrades itself to attested ownership or master control.
25. A repair action cannot mark an external page fixed merely because Jovie opened it or prepared a draft. External resolution requires later observed evidence. Draft requests are local and unsent.
26. Collision outcomes feed subsequent discovery and matching. Rejected artist/song identities cannot be silently reintroduced without new evidence and explicit review.
27. The selected content card is the post-release action boundary. Downloads, stats, rightsholders, presence, relationships, and optimization attach to that canonical track/release context without creating a second content record.

## Stage derivation

The first release uses deterministic adapters over current source records:

| Source | Idea | In progress | Out |
| --- | --- | --- | --- |
| Creator document | every idea/research/script revision | a distinct execution item linked to the document | published output linked to the document |
| Discography release | — | draft or scheduled | released |
| YouTube video | — | private/unlisted or pending publication | public and published |
| Social distribution item | pending concept | approved or scheduled | dispatched/published |
| Merch | draft | active preparation | published/available |

These adapters are pure, tested functions. Persisted stage is introduced only for sources whose lifecycle cannot be derived without ambiguity.

## YouTube import boundary

Extend the existing YouTube connector and `syncChannelVideos` path. Do not build a new sync service or cron.

The import flow:

1. Connect the artist-owned channel with least-privilege OAuth.
2. List the channel uploads in bounded pages and upsert canonical video identity.
3. Classify content type and retain confidence.
4. Ingest provider thumbnails as immutable versions and set the observed current version.
5. Pull permitted analytics into append-only metric windows.
6. Resolve ISRC/release candidates from provider metadata plus existing recordings; fail closed to pending review when evidence is weak.
7. Reconcile credited collaborators through canonical artist identities and credit joins only when evidence supports it.
8. Project the imported video into the Library immediately, including unmatched state and next action.

Channel selection is explicit: Jovie imports only the authenticated channel selected for the current creator profile. A token, channel, or connector account may not be silently reused across profiles. OAuth denial, revoked scopes, a changed channel owner, and quota exhaustion preserve the last good read model and expose a recoverable status.

Cost boundary: one initial paginated import per explicit user action, then reuse the existing scheduled refresh seam. Log pages, videos, analytics calls, and quota class. No per-user polling loop and no new scheduled job.

Approved release matches project non-primary canonical release credits into the Library artist graph. The projection reads `artists` and `releaseArtists`; it never extracts collaborator identities from a YouTube title or description. Reconciliation runs after approval and on later imports so corrected catalog credits converge without duplicating artist identities.

## Onboarding research boundary

Decision: **compose**, with no vendor purchase or new open-web crawler in this slice.

1. **Discover — Exa:** artist/song/person entity search and find-similar for directories, Genius, Discogs, press, remix, karaoke, and Fantopia-class opportunities.
2. **Extract — Firecrawl:** known-URL markdown, outbound-link extraction, and dead-link status. Extraction does not establish identity or legal title.
3. **Remember — Cloudflare AI Search + Browser Run `/crawl`:** one robots-respecting per-artist index over Jovie's approved crawl. It answers questions about our crawl; it is not the open-web discovery engine. The Cloudflare-AI-Search bot identity remains visible. No TikTok scraping in the US.
4. **Societies — Songview + MLC public APIs:** artist-typed queries become `observed` composition evidence only.

The onboarding output is the same Library object used after onboarding: repair queue, collisions, placement opportunities, observed rightsholder strip, downloads-ready state for attested owned tracks, and disconnected stats. Research writes evidence and drafts; it never sends outreach, claims legal title, activates a download, or invents performance.

## Artist-rule enforcement boundary

The rule engine returns an explainable decision, not a boolean alone:

- effective rules in precedence order;
- rules that were shadowed and why;
- accepted scoped exception, if any;
- blocking rule and source evidence when generation or publication must stop.

Generative workflows receive the resolved rule set before producing copy or visual briefs. Publication paths must fail closed on a blocking hard rule. Soft preferences remain ranking inputs and must not masquerade as safety policy.

Conflicts at the same precedence level resolve by narrower scope, then newer effective date. If both are equal, resolution fails closed and asks for review. Superseding or revoking a rule never erases its provenance or the decisions it influenced.

## Data flow

```text
creator documents ─┐
discography ────────┼─> source adapters ─> LibraryWorkItem[] ─> stage + type + relationship filters
YouTube Library ────┤
workflow drafts ────┘

memory observation ─> suggested rule ─> human confirmation ─> active artist rule
                                                           └─> explainable resolver ─> generation / publication gate
```

## Acceptance and failure behavior

- Stage and type controls are independent and URL-restorable; switching stages cannot shift the shell or silently discard a creator-document draft.
- Creator documents no longer live behind a top-level `Ideas & Scripts` destination. Their kind remains text; their lifecycle determines the stage.
- A public imported video appears in Out even when unmatched. A weak ISRC or collaborator hypothesis appears as review-required evidence, never as a confirmed relationship.
- Re-importing the same channel updates provider fields and appends metric/thumbnail evidence without duplicating videos or erasing prior evidence.
- A confirmed non-overridable rule blocks an incompatible output and explains the source. An unconfirmed memory suggestion never blocks or mutates output.
- Published social content remains tied to the release through its canonical workflow or future social-content owner; Library projection never copies its body into a second source of truth.
- A reviewed “wears product” edge can place a merch chip on a video and make it eligible for a provider placement workflow. Provider rejection or removal leaves the Library edge intact and reports the external state separately.
- Redirect and affiliate performance can inform the next experiment only after conversion evidence is joined through the declared attribution model and checked against artist, sponsor, disclosure, and privacy guardrails.
- The Tim queue exposes the locked public evidence (dead Genius link, missing canonical profile/song links, correct Discogs/Beatport/AllMusic identities, catalog Instagram, Jovie legacy 404s, and rejected identities) as open findings only. The migration does not outbound or claim any repair completed.
- The selected track card always reserves stable space for Downloads, Stats, Rightsholders, and Presence. Empty/loading/connected transitions do not move the surrounding Library shell.

## Explicit non-goals for the first release

- Automatic collaborator outreach, public graph claims, or inferred endorsements.
- Automatic thumbnail swaps or winner promotion without approval.
- Automatic activation of memory-derived rules.
- A new generalized scheduler, DAM, social publisher, or replacement discography.
- Automatic sponsor inference, undisclosed affiliate publication, or automatic merch-shelf placement without provider eligibility and explicit approval.
- License sales, license-request hero actions, a licensing inbox, or treating a download email as a grant.
- Automatic external edits or request sends from onboarding research.

## Delivery slices

1. Unified Library stage adapters and navigation, including creator documents in the same surface.
2. YouTube OAuth/provider import wiring, Library projection, release/ISRC review, collaborator reconciliation, and thumbnail evidence.
3. Typed relationship edges for releases, collaborators, featured merch, brand mentions, tracked destinations, affiliate offers, and provider placements.
4. Artist-rule schema, suggestion/confirmation flow, precedence resolver, scoped exceptions, and enforcement integration.
5. Attribution and experiment evidence feeding guarded, explainable continuous optimization.
6. Visual conformance, coverage, migration verification, PR/CI/queue, deployment provenance, and exact-runtime dogfood.

Each slice must have behavior tests before it is described as shippable. Source, CI, merge queue, deployment, runtime, and recurrence evidence are reported separately.

## Deliberate-red checks

- Treating `idea` as a content kind must fail type-level or unit validation.
- Linking one source item to two canonical IDs without evidence must fail closed to review.
- Promoting an unconfirmed memory observation to an active artist rule must be rejected.
- An item exception against a non-overridable rule must be rejected with the blocking rule and provenance.
- Declaring a thumbnail winner without a locked objective, minimum evidence, and explicit acceptance must be rejected.

## Revisit triggers

- Persist a generic work-item table only when at least two source families cannot express stage or release context through deterministic adapters.
- Add a first-class social-content table when release distribution drafts need editing, analytics, or reuse beyond workflow-run retention.
- Revisit the YouTube refresh cadence only when measured staleness causes a creator-visible error; prefer provider events or the existing reconciliation job.
