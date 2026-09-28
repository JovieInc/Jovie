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
| Routes scanned | 96 |
| Files counted (route-owned or shared layer) | 639 |
| Raw Tailwind palette utilities and hex colors | 262 |
| Arbitrary values | 263 |
| Raw `<button>` tags | 111 |
| Legacy `--linear-*` tokens | 93 |
| Visible 44/48px controls (`h-11`, `h-12`, `size-*`) | 23 |
| Danger alias utilities (`error`, `destructive`, `red`) | 165 |
| Registry entries with `penRootId: null` | 17 |
| Status pill, badge, dot, and glyph components | 9 |
| Entity header components | 5 |
| Rail components | 10 |

| Shared design-system layers reached by routes | Count |
|---|---:|
| Files counted (route-owned or shared layer) | 278 |
| Raw Tailwind palette utilities and hex colors | 146 |
| Arbitrary values | 197 |
| Raw `<button>` tags | 62 |
| Legacy `--linear-*` tokens | 42 |
| Visible 44/48px controls (`h-11`, `h-12`, `size-*`) | 22 |
| Danger alias utilities (`error`, `destructive`, `red`) | 38 |

| Registry | Entries | `penRootId: null` |
|---|---:|---:|
| appScreens | 7 | 7 |
| componentRegistry | 11 | 10 |

Routes with at least one signal: 54 of 96.

| Route | Files | Raw palette | Arbitrary | Raw button | --linear-* | 44/48px | Danger alias |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/app` | 81 | 70 | 42 | 17 | 10 | 1 | 9 |
| `/app/admin/activity` | 19 | 27 | 22 | 1 | 10 | 0 | 4 |
| `/app/admin/agent-runs/[id]` | 6 | 2 | 17 | 0 | 10 | 0 | 2 |
| `/app/admin/chat` | 133 | 77 | 51 | 35 | 17 | 7 | 26 |
| `/app/admin/costs` | 18 | 27 | 24 | 1 | 10 | 0 | 4 |
| `/app/admin/features` | 20 | 27 | 22 | 1 | 10 | 0 | 4 |
| `/app/admin/growth` | 55 | 27 | 25 | 2 | 12 | 0 | 25 |
| `/app/admin/hud` | 51 | 46 | 91 | 2 | 14 | 1 | 26 |
| `/app/admin/interviews` | 6 | 2 | 16 | 0 | 10 | 0 | 1 |
| `/app/admin/investors` | 18 | 27 | 25 | 1 | 12 | 0 | 4 |
| `/app/admin/investors/links` | 17 | 27 | 22 | 1 | 10 | 1 | 9 |
| `/app/admin/investors/settings` | 6 | 2 | 18 | 0 | 10 | 0 | 5 |
| `/app/admin/investors/updates` | 6 | 2 | 16 | 0 | 10 | 0 | 2 |
| `/app/admin/people` | 101 | 86 | 34 | 3 | 17 | 2 | 34 |
| `/app/admin/platform-connections` | 8 | 4 | 17 | 0 | 10 | 0 | 2 |
| `/app/admin/playlists` | 8 | 2 | 16 | 0 | 10 | 0 | 1 |
| `/app/admin/revenue-lift` | 6 | 2 | 19 | 0 | 10 | 0 | 1 |
| `/app/admin/screenshots` | 6 | 2 | 17 | 0 | 16 | 0 | 1 |
| `/app/admin/share-studio` | 16 | 27 | 25 | 1 | 10 | 0 | 4 |
| `/app/admin/system` | 9 | 2 | 16 | 0 | 10 | 0 | 1 |
| `/app/calendar` | 37 | 27 | 22 | 3 | 10 | 0 | 4 |
| `/app/chat` | 190 | 127 | 73 | 52 | 17 | 9 | 32 |
| `/app/chat/[id]` | 189 | 127 | 73 | 52 | 17 | 9 | 32 |
| `/app/chats` | 32 | 27 | 21 | 2 | 10 | 0 | 4 |
| `/app/contacts` | 87 | 43 | 28 | 9 | 12 | 1 | 5 |
| `/app/dashboard/earnings` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/dashboard/release-plan` | 6 | 11 | 15 | 0 | 33 | 0 | 1 |
| `/app/dashboard/releases` | 114 | 71 | 41 | 33 | 25 | 2 | 15 |
| `/app/dashboard/releases/[releaseId]/downloads` | 15 | 28 | 22 | 2 | 10 | 0 | 7 |
| `/app/dashboard/releases/[releaseId]/tasks` | 55 | 46 | 23 | 11 | 12 | 1 | 9 |
| `/app/earnings` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/insights` | 35 | 27 | 23 | 2 | 12 | 0 | 4 |
| `/app/jovie-work` | 30 | 27 | 21 | 2 | 10 | 0 | 6 |
| `/app/library` | 114 | 71 | 41 | 33 | 25 | 2 | 15 |
| `/app/lyrics/[trackId]` | 29 | 27 | 21 | 2 | 10 | 0 | 4 |
| `/app/profiles` | 51 | 27 | 22 | 7 | 10 | 1 | 10 |
| `/app/releases/[releaseId]/tasks` | 55 | 46 | 23 | 11 | 12 | 1 | 9 |
| `/app/settings/account` | 47 | 27 | 21 | 2 | 10 | 0 | 12 |
| `/app/settings/admin` | 23 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/settings/analytics` | 38 | 27 | 21 | 2 | 10 | 0 | 5 |
| `/app/settings/artist-profile` | 80 | 77 | 46 | 10 | 10 | 2 | 13 |
| `/app/settings/audience` | 42 | 32 | 25 | 3 | 10 | 0 | 8 |
| `/app/settings/billing` | 33 | 27 | 23 | 2 | 10 | 0 | 5 |
| `/app/settings/connectors` | 32 | 27 | 21 | 2 | 10 | 0 | 5 |
| `/app/settings/contacts` | 43 | 27 | 22 | 2 | 10 | 0 | 5 |
| `/app/settings/data-privacy` | 33 | 27 | 21 | 2 | 10 | 0 | 4 |
| `/app/settings/payments` | 29 | 27 | 23 | 2 | 10 | 0 | 5 |
| `/app/settings/referral` | 7 | 2 | 15 | 0 | 10 | 0 | 1 |
| `/app/settings/retargeting-ads` | 6 | 2 | 16 | 0 | 10 | 2 | 1 |
| `/app/settings/touring` | 37 | 28 | 21 | 4 | 10 | 0 | 4 |
| `/app/settings/usage` | 33 | 27 | 24 | 2 | 10 | 0 | 7 |
| `/app/tasks` | 75 | 52 | 73 | 28 | 30 | 4 | 14 |
| `/app/tour-dates` | 39 | 38 | 22 | 3 | 10 | 1 | 8 |
| `/app/youtube` | 27 | 27 | 21 | 2 | 10 | 0 | 4 |
<!-- drift-ledger:end -->
