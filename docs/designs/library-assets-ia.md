# Library → Assets IA decision

Status: launch slice recommendation for JOV-4801

## Decision

Rename the user-facing surface to **Assets**, but keep `/library` as the
canonical route. Present assets in one unified surface with a compact type
switcher and strong filters. Do not create four permanent media tabs or move
files between systems.

The primary switcher is:

| View | User job | Includes |
| --- | --- | --- |
| All | See the complete working set | every active asset |
| Songs | Find playable music quickly | releases and their audio/provider data |
| Images | Find artwork and visual files | artwork and image-backed merch assets |
| Videos | Find video assets and links | video assets |
| Text | Find lyrics and written material | lyrics and text assets |

`Songs` is the discoverability escape hatch. It must be one click from the
default Assets view, preserve the existing release row/card, and show a result
count. Type filters remain composable with status, approval, and search. The
view mode stays grid/list/table and continues to use the existing JOV-3481
implementation.

## Release relationship

Keep **Releases inside Assets** as a release-tied view/filter. The existing
`/releases → /library?view=releases` redirect is the migration-safe seam and
already prevents two competing release catalogs. A release is the natural
collection boundary for its song, artwork, video, lyrics, and provider assets.

Use a lightweight, virtual collection concept rather than a new collection
table:

- `Release: <name>` is a filter/context derived from the existing release ID.
- `Unattached` is a future-compatible label for assets without a release ID.
- Filtering changes the query/view state only. It never moves or duplicates a
  file.

The first slice does not need persisted user-created collections. It only needs
the release context to be addressable from the release view and shareable in a
URL.

## Information hierarchy

1. Page title: `Assets`
2. One-line summary: visible result count and active release/type context
3. Primary type switcher: `All`, `Songs`, `Images`, `Videos`, `Text`
4. Search and filters: status, approval, release, and provider where relevant
5. Existing grid/list/table controls from JOV-3481
6. Asset results, with songs retaining title, artwork, play affordance, and
   release metadata

Do not lead with a media taxonomy card wall. It consumes space and makes the
most important item type, songs, compete with decorative category chrome.

## Mixed-library discoverability check

The risk case is a library containing 2 songs, 8 images, 4 videos, and 3 text
assets. In `All`, the first viewport must expose the `Songs` control and its
count without scrolling. Selecting `Songs` must return both songs with no
interleaving from other types. Search for a song title must also return the
song while the type context remains visible.

Representative screenshot states:

| State | Fixture shape | Expected proof |
| --- | --- | --- |
| Empty | no active assets | `Assets` title, one useful empty message, type controls still visible |
| Mixed library | 2 songs, 8 images, 4 videos, 3 text | `Songs` is visible above the fold and count is not buried |
| Song-heavy library | 24 songs, 2 images, 1 video | songs remain scannable in All and Songs; no media tab wall |
| Release-tied collection | one release with song, artwork, video, lyrics | release context is visible and all four assets stay linked without moving files |

## First shippable slice

1. Change visible naming from `Library` to `Assets` in the shell/page title and
   relevant empty/loading copy.
2. Add the `Songs` and `Text` view labels as adapters over the existing asset
   kind/release predicates. Keep existing `Images`, `Videos`, and `Audio`
   behavior compatible while the label migrates to `Songs`.
3. Add a release context query parameter that filters the current read model;
   do not add storage, migrations, or file movement.
4. Add fixture-level tests for the four screenshot states, especially the
   mixed-library count and the release context retaining all asset types.
5. Capture desktop and narrow-width screenshots for those states using the
   existing grid/list/table controls.

## Non-goals

- No full Library rewrite.
- No new asset storage system or file migration.
- No persisted collection-management product, drag-and-drop, or sharing
  permissions model.
- No separate Releases navigation tree while `/releases` already resolves to
  the release-filtered Assets surface.
- No replacement of JOV-3481 view-mode code.

## Success measure

In a mixed-assets screenshot review, a reviewer can identify and open the
`Songs` view in one action, and the filtered result contains every song with no
non-song interleaving. The URL preserves the selected type and release context
across reload and direct navigation.
