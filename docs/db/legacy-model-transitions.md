# Legacy content and audience transitions

Source inventory at `5434cf1da03`; JOV-6274, `DB-AUDIT-20260913/10`.
This is source evidence, not a deployed-schema or historical-parity receipt.
JOV-6044 owns integrity coordination; JOV-6063 owns obsolete-path removal.

| Model | Authoritative writes | Compatibility reads / projections | Backfill and terminal gate |
| --- | --- | --- | --- |
| Content | Spotify import calls `upsertRecording` / `upsertReleaseTrack` in `lib/discography/queries.ts`. Canonical credits use `recordingArtists`. | Public slug data, release-track loader, lyrics, previews, artist search and slug reservation still read `discog_tracks`; Spotify import also resolves legacy Spotify IDs. | No relationship-complete legacy backfill found. JOV-8443 owns retirement and parity proof before removal. |
| Audience actions | `lib/audience/record-audience-event.ts` inserts `audience_actions` and updates a five-entry `latest_actions` projection plus scalar label. | Dashboard details/member API read JSONB; recent activity reads normalized actions filtered by profile. Seeds still write JSONB directly. | 0030 created tables and summaries; 0034 added nullable profile ownership without filling old rows. This slice backfills missing owners only; JOV-8444 adds bounded reconciliation and rebuild below; target parity is required before cleanup. |
| Audience referrers | Visit route writes normalized referrers and a three-entry JSONB projection; missing-table fallback still retains JSONB. `/api/track` initializes JSONB referrers. | Analytics expands JSONB; dashboard reads JSONB. `audience_referrers` is registered in the schema barrel; JSONB-only fallback remains supported. | JOV-8444 adds provenance reconciliation below; read cutover or removal still requires target receipts. |

## Remaining content writers (JOV-8443)

The “stop writing” comment is intent, not enforcement: `queries.ts:upsertTrack`
still inserts legacy tracks (no production caller found); both seed scripts insert
legacy rows. `updateTrackLyrics` has a discovery caller. `savePrimaryIsrc` edits
legacy-only releases, and `slug.ts` supports legacy slug edits. These supported
edits need canonical destinations before retirement. Track credits still have
legacy junctions; do not silently discard them or provider metadata.

Removal must reconcile `provider_links`, `smart_link_targets`,
`content_slug_redirects`, `pre_save_tokens` and `track_artists`, including URLs,
credits, legacy IDs and public slugs. Matching title/ISRC alone is insufficient:
recording uniqueness is per profile, while appearances are per release/position.

## Audience ownership batch

Migration 0139 adds `(audience_member_id, creator_profile_id)` consistency through a composite FK
and its referenced unique index. Mismatched non-null historical owners cause
migration failure; investigate them rather than assigning a winner. NULL owners
remain valid for old callers and historical reads. New canonical events already
supply an owner. No table, history field or event is deleted.

Run from the repository root with the authorized target's Doppler scope and
maintenance role able to read all rows on that profile (RLS remains enforced):

```sh
pnpm --filter=@jovie/web run backfill:audience-action-owners --profile-id <uuid> --limit 100
pnpm --filter=@jovie/web run backfill:audience-action-owners --profile-id <uuid> --limit 100 --apply
```

Dry-run is default. Each invocation scans at most 1,000 missing-owner actions on
one profile, updates only NULL owners from their member, and emits scanned/updated
counts, `nextCursor`, total, missing and mismatched counts. Resume with `--cursor`;
retry after failure is safe. Overlapping runs cannot duplicate rows or overwrite
non-null owners. Finish with a cursor-free reconciliation pass: concurrently
inserted UUIDs can sort behind the cursor. Success requires missing/mismatched
both zero, unchanged event count and preserved event/parent/provenance fields.
Timeouts bound statements (30s) and lock waits (5s); reconciliation uses exact
bigint decimal strings. No automatic production invocation is introduced.

## Semantics, rebuild and destructive gates

Retain JSONB tags, UTM parameters, event properties/context and bounded detail
projections. Live action projections are derived; the JOV-8444 operator below reconciles
JSONB-only seed/legacy history before rebuilding. Target parity remains a
commissioning gate. Existing alert-state rebuilding remains in
`lib/notifications/audience-alert-state.ts`; it is a separate projection.

Reuse JOV-3063 for date/instant/time-zone changes. This batch preserves NULL and
backdated `timestamptz` event timestamps, calendar release dates, integer duration,
amount and counter fields; it does not infer missing times or change units.

No destructive cleanup is authorized by coexistence. Before removal, JOV-8443 /
JOV-8444 must show zero remaining obsolete writers, reader compatibility and
relationship/provenance parity; retain a restorable pre-change backup, prove
restoration on an isolated target, and record existing cleanup approval. Rollback
of this additive slice is the prior application with legacy reads retained;
keep the ownership fence and correct filled owners. No reverse data rewrite is
needed. Migration index/FK creation scans existing data and fails on lock/statement
timeout; retry in a suitable window after investigating failures.

**Ship now:** ownership fence and bounded missing-owner repair.
**Re-evaluate when:** JOV-8443 / JOV-8444 produce parity and rebuild receipts.
**Then:** remove only the proven obsolete paths in separately guarded slices.

## Historical audience reconciliation and rebuild (JOV-8444)

`rebuild:audience-projections` is an operator command, dry-run by default:

```sh
pnpm --filter=@jovie/web run rebuild:audience-projections --profile-id <uuid> --limit 10
pnpm --filter=@jovie/web run rebuild:audience-projections --profile-id <uuid> --limit 10 --apply
```

Use the authorized target's Doppler scope and maintenance role. Finish the
missing-owner batch above first. No production invocation or read cutover is
automatic. One transaction locks at most 100 members of one profile, ordered by
UUID, with 5s lock / 30s statement timeouts. Resume using `--cursor`; finish with
a cursor-free pass because concurrent UUIDs can sort behind the cursor. A member
with more than 10,000 normalized events of either kind, or a legacy array over
1,000 entries / 256 KiB, fails closed with its original data intact. The command
reports scanned members, cursor, existing event totals, matched and imported
counts, and reconciled legacy entry counts for each event kind. An interrupted
batch rolls back; overlapping batches serialize on the member row.

**EVENT: provenance identity.** New live actions share a UUID and one timestamp
between their normalized event and compact projection. For historical entries,
identity is `(member, kind, v1 SHA-256 of canonical full payload, occurrence)`;
array position is not identity. Repeated equal entries retain their multiplicity.
Before inserting, reconcile one-to-one against existing member events with equal
known fields and exact parsed instants, including NULL. Explicit event UUIDs must
resolve on the same member and agree with the payload. A conflicting timestamp
on an otherwise compatible unclaimed event fails closed: the old action writer
sampled its projection clock after the database round trip, so timestamp drift
cannot prove an independent event. Do not guess a match or import a duplicate.
Missing/invalid labels, URLs, unproven wall times and foreign relationships also
fail. Preserve the fallback and resolve timestamp interpretation under JOV-3063.

Before the first apply, `audience_projection_snapshots` retains the exact original
arrays (including NULL) and scalar summaries. Imported and matched normalized
events retain the entire raw object in `legacy_payload`, including unknown
metadata and original timestamp spelling; `legacy_key` fences duplicate replay.
No existing event IDs, times, properties/context or relationships are rewritten.
Historical action `sourceLinkId` / `clickEventId` are validated against the member's
profile before insertion; existing normalized relationships receive the same
check. Missing legacy action labels can use the seed's `action` string without
rewriting its raw shape. Missing referrer times become NULL: migration 0141 only
relaxes nullability, never converts or rewrites existing instants (JOV-3063).

Rebuild reads normalized events plus the retained original and current fallback.
The original snapshot stays immutable; later JSONB-only `/api/track` initial
referrers and the visit route's missing-table fallback are imported on the next
pass. Registering `audienceReferrers` in the schema barrel repairs generation;
0141 tolerates the table already created by 0030. Existing compatibility writers
and readers stay enabled. Projections select timestamp descending, NULLs last,
then UUID ascending; retain five actions and three referrers and rebuild their
scalar label/URL. Older overflow remains in normalized history and raw snapshots.
Tags, UTM, properties/context, visits, engagement and alert summaries retain their
current semantics; incomplete legacy events cannot reconstruct lifetime counters.

The PostgreSQL regression fixture proves event/relationship reconciliation,
tenant isolation, bounded resume, concurrent replay, overflow retention and exact
snapshot restore followed by the same rebuild. This is local evidence. It does
not certify production parity or authorize cleanup. Retained readers include the
member API/detail views, recent activity and JSONB referrer analytics. JOV-8444's
production gate still requires retained-read comparisons, zero unresolved
provenance/owner/relationship discrepancies, full-profile event counts before and
after (delta = imported), and a restored isolated backup of that target before
any separately authorized cleanup. Restore arrays/scalars from the snapshot only
in a quiesced, isolated target; restoring on an active writer would lose new
projection entries. Keep the additive schema and authoritative events on rollback.

**Ship now:** bounded, restartable operator conversion and rebuild with legacy
fallback retained. **Re-evaluate when:** a member exceeds these bounds or target
parity/retained-read/restore receipts exist. **Then:** use a separately reviewed
smaller event-page strategy for oversized members, or consider only the cleanup
whose target evidence passes the gates above; JOV-8444 retains that commissioning.
