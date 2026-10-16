# Design drift ledger

This ledger is the machine-generated half of the authenticated-app drift
audit. `scripts/design-drift-ledger.mjs` walks the import graph of every page
under `apps/web/app/app/(shell)/` and counts drift signals per route. The
committed baseline lives in [drift-ledger.json](./drift-ledger.json).

- **Regenerate:** `pnpm design:drift-ledger` rewrites the JSON and the table
  below.
- **Check:** `pnpm design:drift-ledger:check` fails when an aggregate count
  grows or when this table no longer matches the JSON. Shrinking drift passes.
  Run the regenerate command afterwards to lock in the lower count.
- **Governance:** `pnpm design:governance:audit` runs the check as drift class
  12 (`design-drift-ledger`). Growth is WARN for the first release. Unreadable
  inputs are FAIL. See [GOVERNANCE.md](./GOVERNANCE.md).

The [October 15 baseline review](./DRIFT_LEDGER_BASELINE_REVIEW.md) attributes
the accepted growth to source changes and reconciles all signal deltas.

Signals per file:

- **Raw palette:** Tailwind palette colour utilities such as `text-amber-700`,
  `bg-white`, and hex colour literals.
- **Arbitrary:** arbitrary values such as `w-[327px]`, using the same pattern
  as the source-identity ratchet.
- **Raw button:** lowercase `<button>` tags, using the raw-button ratchet
  pattern.
- **`--linear-*`:** legacy token references, using the linear-namespace
  ratchet pattern.
- **44/48px:** visible `h-11`, `h-12`, `size-11`, and `size-12` controls.
- **Danger alias:** `text-`, `bg-`, and `border-` forms of `error`,
  `destructive`, and `red`.

Aggregate signal counts use the union of files reachable from any route, so
a shared component counts once. Per-route counts include every file in that
route's graph. Imports from `packages/*` are out of scope.

<!-- drift-ledger:start -->
| Aggregate | Count |
|---|---:|
| Routes scanned | 112 |
| Files counted (route-owned or shared layer) | 727 |
| Raw Tailwind palette utilities and hex colors | 237 |
| Arbitrary values | 241 |
| Raw `<button>` tags | 109 |
| Legacy `--linear-*` tokens | 86 |
| Visible 44/48px controls (`h-11`, `h-12`, `size-*`) | 22 |
| Danger alias utilities (`error`, `destructive`, `red`) | 181 |
| Registry entries with `penRootId: null` | 14 |
| Status pill, badge, dot, and glyph components | 9 |
| Entity header components | 1 |
| Rail components | 13 |

| Shared design-system layers reached by routes | Count |
|---|---:|
| Files counted (route-owned or shared layer) | 345 |
| Raw Tailwind palette utilities and hex colors | 219 |
| Arbitrary values | 342 |
| Raw `<button>` tags | 65 |
| Legacy `--linear-*` tokens | 61 |
| Visible 44/48px controls (`h-11`, `h-12`, `size-*`) | 21 |
| Danger alias utilities (`error`, `destructive`, `red`) | 42 |

| Registry | Entries | `penRootId: null` |
|---|---:|---:|
| appScreens | 7 | 4 |
| componentRegistry | 11 | 10 |

Routes with at least one signal: 64 of 112.

| Route | Files | Raw palette | Arbitrary | Raw button | --linear-* | 44/48px | Danger alias |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/app` | 83 | 67 | 42 | 21 | 10 | 0 | 23 |
| `/app/admin/activity` | 16 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/agent-runs/[id]` | 3 | 0 | 1 | 0 | 0 | 0 | 1 |
| `/app/admin/certifications` | 22 | 27 | 6 | 1 | 0 | 0 | 7 |
| `/app/admin/chat` | 134 | 51 | 25 | 23 | 1 | 4 | 27 |
| `/app/admin/chat-playground` | 79 | 40 | 18 | 16 | 1 | 0 | 24 |
| `/app/admin/costs` | 17 | 25 | 6 | 1 | 0 | 0 | 4 |
| `/app/admin/feature-registry` | 22 | 27 | 6 | 1 | 0 | 0 | 7 |
| `/app/admin/features` | 19 | 25 | 6 | 1 | 0 | 0 | 4 |
| `/app/admin/growth` | 60 | 25 | 9 | 2 | 2 | 0 | 33 |
| `/app/admin/hud` | 55 | 27 | 71 | 2 | 4 | 1 | 25 |
| `/app/admin/inbox` | 9 | 0 | 0 | 0 | 0 | 0 | 2 |
| `/app/admin/integrations` | 144 | 51 | 27 | 23 | 1 | 5 | 29 |
| `/app/admin/investors` | 15 | 25 | 9 | 1 | 2 | 0 | 3 |
| `/app/admin/investors/links` | 14 | 25 | 6 | 1 | 0 | 1 | 8 |
| `/app/admin/investors/settings` | 3 | 0 | 2 | 0 | 0 | 0 | 4 |
| `/app/admin/investors/updates` | 3 | 0 | 0 | 0 | 0 | 0 | 1 |
| `/app/admin/lists` | 13 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/lists/[id]` | 16 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/lists/views/[viewId]` | 14 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/needs-you` | 15 | 25 | 6 | 1 | 0 | 0 | 5 |
| `/app/admin/operations` | 19 | 25 | 6 | 1 | 0 | 0 | 6 |
| `/app/admin/outbound` | 22 | 25 | 6 | 1 | 0 | 0 | 5 |
| `/app/admin/people` | 110 | 91 | 17 | 4 | 6 | 2 | 29 |
| `/app/admin/platform-connections` | 12 | 9 | 7 | 1 | 0 | 0 | 2 |
| `/app/admin/presence` | 22 | 25 | 6 | 1 | 0 | 0 | 7 |
| `/app/admin/revenue-lift` | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| `/app/admin/screenshots` | 3 | 0 | 1 | 0 | 6 | 0 | 0 |
| `/app/admin/share-studio` | 16 | 25 | 9 | 2 | 0 | 0 | 3 |
| `/app/admin/shipping` | 10 | 0 | 0 | 0 | 0 | 0 | 4 |
| `/app/admin/wiki` | 7 | 26 | 0 | 0 | 0 | 0 | 0 |
| `/app/calendar` | 34 | 25 | 7 | 3 | 0 | 0 | 3 |
| `/app/chat` | 193 | 99 | 62 | 40 | 11 | 5 | 34 |
| `/app/chat/[id]` | 194 | 99 | 62 | 40 | 11 | 5 | 34 |
| `/app/chats` | 29 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/contacts` | 83 | 41 | 13 | 9 | 2 | 1 | 4 |
| `/app/dashboard/earnings` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/dashboard/release-plan` | 3 | 9 | 0 | 0 | 23 | 0 | 0 |
| `/app/dashboard/releases` | 119 | 58 | 41 | 38 | 25 | 6 | 14 |
| `/app/dashboard/releases/[releaseId]/downloads` | 12 | 26 | 7 | 2 | 0 | 0 | 6 |
| `/app/dashboard/releases/[releaseId]/tasks` | 53 | 31 | 8 | 11 | 2 | 1 | 7 |
| `/app/earnings` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/insights` | 32 | 25 | 8 | 2 | 2 | 0 | 3 |
| `/app/library` | 118 | 58 | 41 | 38 | 25 | 6 | 14 |
| `/app/links` | 26 | 25 | 6 | 3 | 0 | 0 | 3 |
| `/app/lyrics/[trackId]` | 26 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/presence` | 53 | 25 | 7 | 6 | 0 | 2 | 10 |
| `/app/releases/[releaseId]/tasks` | 53 | 31 | 8 | 11 | 2 | 1 | 7 |
| `/app/settings/account` | 47 | 25 | 17 | 2 | 0 | 0 | 11 |
| `/app/settings/admin` | 23 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/settings/analytics` | 37 | 25 | 8 | 2 | 0 | 0 | 4 |
| `/app/settings/audience` | 41 | 28 | 11 | 3 | 0 | 0 | 7 |
| `/app/settings/billing` | 32 | 25 | 10 | 2 | 0 | 0 | 4 |
| `/app/settings/connectors` | 31 | 25 | 8 | 2 | 0 | 0 | 5 |
| `/app/settings/contacts` | 41 | 25 | 9 | 2 | 0 | 0 | 4 |
| `/app/settings/data-privacy` | 32 | 25 | 8 | 2 | 0 | 0 | 3 |
| `/app/settings/payments` | 28 | 25 | 10 | 2 | 0 | 0 | 4 |
| `/app/settings/profile` | 84 | 74 | 48 | 10 | 10 | 1 | 13 |
| `/app/settings/referral` | 6 | 0 | 2 | 0 | 0 | 0 | 0 |
| `/app/settings/touring` | 36 | 26 | 8 | 4 | 0 | 0 | 3 |
| `/app/settings/usage` | 32 | 25 | 8 | 2 | 0 | 0 | 3 |
| `/app/tasks` | 74 | 39 | 73 | 29 | 30 | 5 | 12 |
| `/app/tour-dates` | 36 | 36 | 7 | 3 | 0 | 0 | 7 |
| `/app/youtube` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
<!-- drift-ledger:end -->
