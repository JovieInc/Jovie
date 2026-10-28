# JOV-7489: changelog permalink identity

Written by the build run under the `brief-auto` admission (work order
`design-brief-jov-7489`): steps 1–9 were missing at claim, so this brief is
derived from the template and canon, not from a design pass. The permalink
identity change itself shipped in [#20074](https://github.com/JovieInc/Jovie/pull/20074);
this brief records that design against the mounted surface, and the carrying
PR completes the rework evidence (before/after failing-to-passing execution
and staging fresh-navigation/old-fragment proof). `gbrain-unavailable`: the
brain is not linked in this runtime; repo evidence and the checked-in canon
are the sources here.

## 1. IA / message

Message: A published customer-update link is permanent — copy edits, inserted
neighbors, section moves and reordering never break it.

IA preflight (canon `ENGINEERING.md`), recorded for this slice:

- Current mounted/source: `apps/web/app/(marketing)/changelog/page.tsx`
  renders the editorial hero (`ReleaseJournalHero`, pen `bBTae`), the customer
  archive (`CustomerChangelogArchive`, pen canvas Assembly `/changelog` `Zgs4e`),
  the subscribe column and the footer CTA; `changelog/[version]/page.tsx` is
  the post detail; `feed.json`, `feed.xml` and `whats-new.json` are the
  machine consumers.
- Absorbing action: URL-fragment navigation to one entry (fresh load,
  in-page hash change, category-filtered and unloaded-month states are
  JOV-7490's resolver, unchanged here).
- Merge/replace/delete accounting: no surface is replaced or deleted; the
  fragment identity moves from derived-at-render (title + date + list index)
  to persisted-at-publication (receipt `entryId`/`slug`/`aliases` plus the
  recorded migrations for pre-receipt history). No parallel store, digest
  engine or scheduler is added.
- States/density: entry cards, month rails and the collapsed engineering
  history are unchanged; withdrawn entries add exactly one quiet tombstone
  state ("This update is no longer published.") instead of silently
  resolving to an unrelated entry.
- Before/after complexity: render-time derivation and its index bookkeeping
  are deleted; the projector reads three stored fields. Complexity at render
  goes down; the publication contract owns identity once.

## 2. Certified capabilities

- artist-notifications

The audited entry that anchors this issue ("Get updates from an artist") is
the registry's opt-in fan-notifications capability; the changelog page itself
claims nothing new.

## 3. Outcome

Outcome: Every shared changelog URL keeps pointing at the exact update it
was published with, including the audited artist-updates fragment
`get-updates-from-an-artist-2026-10-02-1`.

## 4. Problem → solution

Problem: The published fragment was `slugify(title, release, index)` — derived
from mutable copy and list position — so a title edit, an inserted preceding
bullet, a section move or a reorder silently invalidated every already-shared
link, including the founder-audited artist-updates URL.

Solution: Persist an immutable entry identity (`customer-update:<outcomeKey>`)
and canonical slug (`update-<outcomeKey>`) in the daily publication receipt at
first publication; carry every prior published fragment as a persisted alias,
with pre-receipt history recorded in
`apps/web/data/customer-changelog-permalink-migrations.json` keyed by release,
story id and exact source-id set — never regenerated from present copy. The
canonical parser, projector, archive, detail route, hero and feeds read those
stored fields; duplicate identities or fragments fail closed; withdrawn
receipted entries resolve to an explicit tombstone.

## 5. Layout

Sections:

- hero
- content-prose

The mounted changelog composition, not a new factory page: editorial hero
plus the customer archive. This change touches fragment anchors and identity
inside `content-prose`; it adds, splits or removes no section.

## 6. Copy

Copy:

- hero: What's new in Jovie — audience and control updates, not every deploy.
- content-prose: Each update states its approved outcome in the publisher's
  copy; anchor text stays the entry title and never encodes date or position.

Copy is owned by the publication receipts (`CHANGELOG_PUBLICATION.md`); this
slice changes no public copy.

## 7. Imagery

Imagery:

- hero: photo
- content-prose: callout

The hero uses the existing editorial photo
(`/images/hero/changelog-index.webp`); entries are text cards.

## 8. Art direction

Component: CustomerChangelogArchive

One canonical owner for entry cards, canonical and alias anchors, tombstones
and the deep-link reveal, on the founder-locked pen canvas (Assembly `/changelog`
`Zgs4e`, hero `bBTae`). No second component family is introduced.

## 9. Creative exploration

Pen: node Zgs4e

The founder-locked changelog canvas (Assembly `/changelog` `Zgs4e`, hero
`bBTae`) named by `changelog-editorial.css` is the exploration record this
build follows; the pen workspace is read-only from this lane and no new node
IDs are asserted. The design as shipped is the existing canvas — no new
creative direction was authored by this run.

## 10. Build checklist

- Jovie website constitution and Certified surface beat: no visual or token
  change; the mounted surface and its tokens are untouched.
- Permalink identity contract as built (the invariant map this brief pins):
  publisher derives identity from `outcomeKey` and preserves prior
  `entryId`/`slug`/`aliases` on republication (`scripts/lib/daily-changelog-publication.mjs`);
  parser fails closed on missing/colliding identity
  (`apps/web/lib/changelog-parser.ts`); projector renders stored identity,
  alias anchors and tombstones (`apps/web/lib/customer-changelog.ts`,
  `apps/web/components/marketing/changelog/CustomerChangelogArchive.tsx`);
  regression coverage runs the real `parseChangelogDocument` /
  `projectCustomerChangelogArchive` on the actual `CHANGELOG.md`, never a
  second slug implementation.
- Evidence carried by this PR: before/after failing-to-passing execution of
  the permalink regression (pre-fix snapshot `3f8f53f` red, current head
  green, commands verbatim below), staging fresh-navigation and old-fragment
  observations, and the exact tested commit.
- No `CHANGELOG.md` edit, no new store/scheduler, no feed or daily-post
  dismissal semantic change, no outbound sends.
