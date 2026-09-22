# YouTube release attribution review

Adopted from Instinct patch eb6083b5997e735bb3c120eab45bad0316761162
(GitHub issue #18031), hardened under JOV-6479, child of JOV-3391.

The pure helpers in `apps/web/lib/youtube-library/foreign-content.ts` and
`foreign-content-playbook.ts` prepare possible mismatch cases and neutral
owner-review drafts. They have no provider calls, persistence, UI integration,
submission or deletion capability. Product integration remains JOV-3391 scope;
provider import is tracked by JOV-5352 and configuration by JOV-3189.

## Evidence and owner review

Classification is per video, using supplied verified catalog membership and
channel relationships. It is a routing hint, never proof that a release is
foreign. Missing catalog membership or an unknown channel can reflect incomplete
input. Every case remains `needs_owner_review`.

Verified catalog videos are excluded unless an explicit owner flag conflicts
with that evidence. Conflicts remain visible and the draft instructs the owner
to reconcile them before any request. A linked channel can carry both legitimate
catalog and a misdelivered release; never reject an entire channel.

`owned_unwanted` identifies a flagged upload on an artist-controlled channel;
that channel relationship does not establish ownership of the recording.
Drafts do not assert that the release belongs to someone else. The owner must
verify the release identity, all affected tracks and exact intended request.

## Guided manual process

[YouTube release management documentation](https://support.google.com/youtube/answer/14075432)
was checked on 2026-09-19. On desktop, open Studio > Content > Releases.
The documented choices distinguish a release belonging to another artist from
an owned release the artist wants removed from their channel. These are requests
for channel dissociation; the playbook never suggests permanent video deletion.
If the release is unavailable or ownership is uncertain, stop for operator or
distributor review. Submission requires the owner's approval of the exact release
and request; monitor any submitted request in Studio.

## Limits and verification

The case key deduplicates a single scan. Deterministic draft text is not durable
audit storage, cross-scan case persistence, or submission idempotency. No helper
submits anything, and no production removal is demonstrated by unit tests.

Ship now: bounded pure review helpers with tests for mixed catalogs, incomplete
input, conflicting evidence, neutral drafts and non-destructive guidance.
Re-evaluate when: JOV-3391 connects a real owner-review surface and release data.
Then: verify authenticated review, exact release approval and persisted audit
receipts before enabling any submission path.
