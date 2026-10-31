---
paths: ["apps/*/app/**", "apps/*/lib/**", "apps/*/components/**", "apps/*/hooks/**", "apps/*/package.json"]
---

# Data architecture

Policy: [data-architecture ADR](../../docs/architecture/data-architecture-adr-2026-10-29.md).
This file is the agent checklist; the ADR is the one canonical copy.

| Need | Do | Not |
|---|---|---|
| Read data for a page | Server Component; cached read = `'use cache'` + `cacheTag(recordTag)` + `cacheLife` | `useEffect` + `fetch`, a new `unstable_cache`, `export const dynamic/revalidate` |
| Save from the UI | Server action → domain write → `updateTag(recordTag)` | `revalidatePath`, `revalidatePath(x, 'layout')`, `revalidateTag('dashboard-data'/'profiles-all')` |
| Save from API/webhook | Route handler → domain write → `revalidateTag(recordTag, 'max')` | Same as above |
| Client view after a save | `setQueryData(exactKey, returned)` or `invalidateQueries({ queryKey: exactKey })` | `router.refresh()` |
| Live data | SSE route stream or refetch on the mutation event | `refetchInterval`, `setInterval` + fetch |
| DB | `import { db } from '@/lib/db'`; batch statements; DB-only transaction callbacks | `@/lib/db/client`, `new Pool`, `neon()`, awaited queries in a loop |
| New library | Entry in `canon/data-architecture.json` + ADR amendment | Installing SWR/axios/Zustand/another ORM |

**Enforced:** `node scripts/data-architecture-guard.mjs` runs in Source Validation
and `pnpm preflight:changed`. A new violation fails; existing ones are
grandfathered per (file, rule) in
`scripts/lib/data-architecture-guard.ratchet.gen.json`, which only shrinks.
After removing one, run `node scripts/data-architecture-guard.mjs --write`.
A justified exception carries `data-arch-allow: <reason>` on the line or a
comment line above; allows are counted.

**Debt intake:** the daily Remediation Sweep (`--mode data-arch`) files one
fingerprinted Linear issue per rule with debt and its top offenders. Pick one up,
fix it, lower the ratchet.
