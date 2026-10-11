# Identity / Work product ontology (JOV-7305)

Status: validated for a bounded rollout on 2026-09-30

GBrain was unavailable for this run. This decision uses current repository
source, shipped route contracts, product fixtures, and current external product
documentation.

EVENT: Identity and Work are Jovie's only top-level product concepts. Identity
means who you are and how you are represented. Work means what you make and put
into the world. Links represent or distribute either concept and are never a
third top-level area.

## Recommendation

Adopt **Identity / Work** in the authenticated customer navigation and product
copy while preserving the existing route and implementation contracts. The
paired nouns passed the five requested audience fixtures. The evidence does not
support using Work as a synonym for tasks, projects, or a workspace, so those
meanings are explicitly excluded.

The bottleneck is findability, not storage. Success means a customer can choose
Identity or Work without deciding whether a link, profile, release, video, or
product is a storage object. Rollback is copy and navigation only because the
canonical routes and data owners do not change.

## Before / after IA proof

| Before | After | Ownership |
| --- | --- | --- |
| Home | Home | Attention and next action at `/app` |
| Presence | Identity | Bio, profile, social, contact, and search presence at `/app/presence` |
| Links | Not top-level | Contextual representation editor at `/app/chat?panel=profile` |
| Library, reachable contextually | Work | Releases, videos, merch, products, events, writing, campaigns, and shareable links at `/app/library` |
| Audience | Audience | People and reach at `/app/contacts?tab=audience` |

The resulting primary rail is `Home / Identity / Work / Audience` on web. The
native surface uses Work while retaining its existing internal library IDs.

## Current IA and capability ownership audit

| Contract | Role after migration | Policy |
| --- | --- | --- |
| `/app/presence` | Canonical Identity surface | Keep |
| `/app/profiles` | Identity compatibility route | Keep redirect |
| `/app/chat?panel=profile` | Contextual profile and link editor | Keep |
| `/app/dashboard/links` | Legacy Identity/link entry | Keep redirect or alias behavior |
| `/app/library` | Canonical Work surface | Keep |
| `/app/releases` | Work release compatibility route | Keep redirect to the Work projection |
| `/app/dashboard/library` | Legacy Work entry | Keep redirect |
| `/api/library/*`, `Library*`, library DB tables and storage keys | Stable implementation contracts | Do not rename for presentation copy |
| `/app/jovie-work` | Autonomous activity feed shown as `Jovie Did This` | Keep the visible activity label to avoid task ambiguity |

This policy prevents product logic from forking by web, native, CLI, MCP, or
automation surface. New integrations may say Work to people, but must use the
existing canonical routes and wire contracts until a separately versioned
contract exists.

## External convention check

Current first-party documentation was checked on 2026-09-30:

| Evidence | What it establishes |
| --- | --- |
| [Behance profile guide](https://help.behance.net/hc/en-us/articles/360034538213-Guide-Fill-Out-Your-Profile) | A person's profile can separate identity fields from a Work tab containing projects. This is the closest direct support for the pair. |
| [YouTube Studio Content](https://support.google.com/youtube/answer/7548152?hl=en-419) | A broad output area can group videos, live content, posts, and playlists without making links the organizing noun. |
| [Shopify products](https://help.shopify.com/en/manual/products) and [Bandcamp music](https://bandcamp.com/help/guides/artists) | Specialists use concrete subtype nouns. Work therefore needs visible type filters and plain empty-state examples. |
| [Notion workspaces](https://www.notion.com/help/intro-to-workspaces) | Library commonly means a place to browse and manage stored workspace content, which reinforces the storage mental model we are leaving. |
| [Asana hierarchy](https://help.asana.com/s/article/how-asana-works?language=en_US) | Work commonly includes goals, portfolios, projects, and tasks. Jovie must guard against that competing meaning. |

Inference: Work is not a universal industry label, but it is the strongest
cross-audience umbrella when paired with Identity and grounded by concrete
output types. Library is clearer for storage and weaker for creation or public
output. Links is precise as a representation mechanism and too narrow as a
top-level product concept.

## Audience fixtures

| Audience | Identity examples | Work examples |
| --- | --- | --- |
| Musician | Artist bio, DSP profiles, social handles | Songs, releases, tour dates, merch |
| Founder | Founder bio, company role, contact presence | Products, launches, campaigns, updates |
| Author | Author bio, bylines, social presence | Books, essays, newsletters, events |
| Creator | Creator profile, channels, contact details | Videos, posts, merch, brand campaigns |
| Expert | Credentials, bio, search presence | Courses, research, talks, advisory products |

Every fixture gives Identity and Work a non-empty, non-overlapping job. A link
can represent the identity or distribute a work item in every fixture.

## Ambiguity guardrails

- Never use Work as the label for a task, project, workspace, queue, or team.
- Keep `Tasks` for action items and `Jovie Did This` for autonomous activity.
- Lead Work screens with output examples and concrete filters such as Releases,
  Videos, Merch, Products, Events, and Writing.
- Use Links only for URLs, destinations, share mechanisms, and profile fields.
- Preserve `presence` and `library` telemetry item IDs. Segment this rollout
  with `canonical_identity_work_v1` instead of breaking historical events.

## Migration decision

**Ship now:** the primary navigation labels and order, Work surface copy,
Identity metadata and breadcrumbs, native visible labels, the ontology contract,
five-audience fixtures, design-reference certification, and a new analytics
variant. Preserve all routes, redirects, API names, database names, storage
keys, test IDs, and telemetry item IDs.

**Re-evaluate when:** the new variant has either 200 consented activations per
measured platform or 14 complete days of evidence, whichever takes longer.
Compare activation, destination-ready, drop-off, short-return, support language,
and whether every fixture can find its expected output from the primary rail in
one action.

**Then:** keep and extend the visible vocabulary only if Work is no worse than
the previous baseline on destination-ready and short-return rates and no
audience fixture repeatedly interprets it as tasks or a workspace. Otherwise,
restore the prior labels and rail placement without changing any route or data
contract.
