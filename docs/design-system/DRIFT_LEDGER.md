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
| Routes scanned | 105 |
| Files counted (route-owned or shared layer) | 676 |
| Raw Tailwind palette utilities and hex colors | 255 |
| Arbitrary values | 250 |
| Raw `<button>` tags | 101 |
| Legacy `--linear-*` tokens | 86 |
| Visible 44/48px controls (`h-11`, `h-12`, `size-*`) | 19 |
| Danger alias utilities (`error`, `destructive`, `red`) | 171 |
| Registry entries with `penRootId: null` | 14 |
| Status pill, badge, dot, and glyph components | 9 |
| Entity header components | 1 |
| Rail components | 11 |

| Shared design-system layers reached by routes | Count |
|---|---:|
| Files counted (route-owned or shared layer) | 281 |
| Raw Tailwind palette utilities and hex colors | 191 |
| Arbitrary values | 210 |
| Raw `<button>` tags | 60 |
| Legacy `--linear-*` tokens | 42 |
| Visible 44/48px controls (`h-11`, `h-12`, `size-*`) | 21 |
| Danger alias utilities (`error`, `destructive`, `red`) | 38 |

| Registry | Entries | `penRootId: null` |
|---|---:|---:|
| appScreens | 7 | 4 |
| componentRegistry | 11 | 10 |

Routes with at least one signal: 57 of 105.

| Route | Files | Raw palette | Arbitrary | Raw button | --linear-* | 44/48px | Danger alias |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/app` | 81 | 67 | 42 | 17 | 10 | 1 | 8 |
| `/app/admin/activity` | 16 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/agent-runs/[id]` | 3 | 0 | 1 | 0 | 0 | 0 | 1 |
| `/app/admin/certifications` | 19 | 28 | 6 | 1 | 0 | 0 | 6 |
| `/app/admin/chat` | 132 | 54 | 25 | 25 | 1 | 3 | 25 |
| `/app/admin/costs` | 15 | 25 | 8 | 1 | 0 | 0 | 3 |
| `/app/admin/feature-registry` | 15 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/features` | 17 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/growth` | 58 | 25 | 9 | 2 | 2 | 0 | 32 |
| `/app/admin/hud` | 50 | 41 | 75 | 2 | 4 | 1 | 25 |
| `/app/admin/investors` | 15 | 25 | 9 | 1 | 2 | 0 | 3 |
| `/app/admin/investors/links` | 14 | 25 | 6 | 1 | 0 | 1 | 8 |
| `/app/admin/investors/settings` | 3 | 0 | 2 | 0 | 0 | 0 | 4 |
| `/app/admin/investors/updates` | 3 | 0 | 0 | 0 | 0 | 0 | 1 |
| `/app/admin/needs-you` | 14 | 37 | 6 | 1 | 0 | 0 | 8 |
| `/app/admin/operations` | 16 | 25 | 6 | 1 | 0 | 0 | 3 |
| `/app/admin/people` | 105 | 91 | 17 | 3 | 6 | 2 | 34 |
| `/app/admin/platform-connections` | 10 | 9 | 7 | 1 | 0 | 0 | 1 |
| `/app/admin/presence` | 17 | 25 | 6 | 1 | 0 | 0 | 7 |
| `/app/admin/revenue-lift` | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| `/app/admin/screenshots` | 3 | 0 | 1 | 0 | 6 | 0 | 0 |
| `/app/admin/share-studio` | 13 | 25 | 9 | 1 | 0 | 0 | 3 |
| `/app/admin/shipping` | 8 | 0 | 0 | 0 | 0 | 0 | 3 |
| `/app/admin/wiki` | 7 | 26 | 0 | 0 | 0 | 0 | 0 |
| `/app/calendar` | 34 | 25 | 7 | 3 | 0 | 0 | 3 |
| `/app/chat` | 192 | 102 | 62 | 42 | 11 | 5 | 31 |
| `/app/chat/[id]` | 191 | 102 | 62 | 42 | 11 | 5 | 31 |
| `/app/chats` | 29 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/contacts` | 82 | 41 | 13 | 9 | 2 | 1 | 4 |
| `/app/dashboard/earnings` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/dashboard/release-plan` | 3 | 9 | 0 | 0 | 23 | 0 | 0 |
| `/app/dashboard/releases` | 115 | 58 | 41 | 33 | 25 | 2 | 14 |
| `/app/dashboard/releases/[releaseId]/downloads` | 12 | 26 | 7 | 2 | 0 | 0 | 6 |
| `/app/dashboard/releases/[releaseId]/tasks` | 52 | 31 | 8 | 11 | 2 | 1 | 7 |
| `/app/earnings` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/insights` | 32 | 25 | 8 | 2 | 2 | 0 | 3 |
| `/app/jovie-work` | 27 | 25 | 6 | 2 | 0 | 0 | 5 |
| `/app/library` | 114 | 58 | 41 | 33 | 25 | 2 | 14 |
| `/app/lyrics/[trackId]` | 26 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/presence` | 49 | 25 | 7 | 7 | 0 | 1 | 9 |
| `/app/releases/[releaseId]/tasks` | 52 | 31 | 8 | 11 | 2 | 1 | 7 |
| `/app/settings/account` | 45 | 25 | 15 | 2 | 0 | 0 | 12 |
| `/app/settings/admin` | 23 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/settings/analytics` | 35 | 25 | 6 | 2 | 0 | 0 | 4 |
| `/app/settings/artist-profile` | 81 | 74 | 46 | 10 | 10 | 2 | 12 |
| `/app/settings/audience` | 39 | 28 | 10 | 3 | 0 | 0 | 7 |
| `/app/settings/billing` | 30 | 25 | 8 | 2 | 0 | 0 | 4 |
| `/app/settings/connectors` | 29 | 25 | 6 | 2 | 0 | 0 | 4 |
| `/app/settings/contacts` | 39 | 25 | 7 | 2 | 0 | 0 | 4 |
| `/app/settings/data-privacy` | 30 | 25 | 6 | 2 | 0 | 0 | 3 |
| `/app/settings/payments` | 26 | 25 | 8 | 2 | 0 | 0 | 4 |
| `/app/settings/retargeting-ads` | 3 | 0 | 1 | 0 | 0 | 2 | 0 |
| `/app/settings/touring` | 34 | 26 | 6 | 4 | 0 | 0 | 3 |
| `/app/settings/usage` | 30 | 25 | 9 | 2 | 0 | 0 | 6 |
| `/app/tasks` | 73 | 39 | 73 | 28 | 30 | 4 | 13 |
| `/app/tour-dates` | 36 | 36 | 7 | 3 | 0 | 1 | 7 |
| `/app/youtube` | 24 | 25 | 6 | 2 | 0 | 0 | 3 |
<!-- drift-ledger:end -->
