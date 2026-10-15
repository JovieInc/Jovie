# Legacy content and audience transitions

Source inventory at `5434cf1da03`; JOV-6274, `DB-AUDIT-20260913/10`.
This is source evidence, not a deployed-schema or historical-parity receipt.
JOV-6044 owns integrity coordination; JOV-6063 owns obsolete-path removal.

| Model | Authoritative writes | Compatibility reads / projections | Backfill and terminal gate |
| --- | --- | --- | --- |
| Content | Spotify import calls `upsertRecording` / `upsertReleaseTrack` in `lib/discography/queries.ts`. Canonical credits use `recordingArtists`. | Public slug data, release-track loader, lyrics, previews, artist search and slug reservation still read `discog_tracks`; Spotify import also resolves legacy Spotify IDs. | No relationship-complete legacy backfill found. JOV-8443 owns retirement and parity proof before removal. |
| Audience actions | `lib/audience/record-audience-event.ts` inserts `audience_actions` and updates a five-entry `latest_actions` projection plus scalar label. | Dashboard details/member API read JSONB; recent activity reads normalized actions filtered by profile. Seeds still write JSONB directly. | 0030 created tables and summaries; 0034 added nullable profile ownership without filling old rows. This slice backfills missing owners only; JOV-8444 owns historical event parity and projection rebuild. |
| Audience referrers | Visit route writes normalized referrers and a three-entry JSONB projection; missing-table fallback still retains JSONB. `/api/track` initializes JSONB referrers. | Analytics expands JSONB; dashboard reads JSONB. `audience_referrers` is declared in `analytics.ts` but absent from the schema barrel used by generation. | No historical parity backfill found. JOV-8444 owns identity/provenance reconciliation before read cutover or field removal. |

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
projections. Live action projections are derived, but a complete historical
rebuild cannot yet be claimed: JSONB-only seed/legacy history needs provenance
identity first (JOV-8444). Existing alert-state rebuilding remains in
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
