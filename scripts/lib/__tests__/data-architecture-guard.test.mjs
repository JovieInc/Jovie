import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  checkAgainstBase,
  checkLibraries,
  checkRatchet,
  inScope,
  lowerRatchet,
  maskSource,
  RULES,
  scanSource,
  topOffenders,
  totalsOf,
} from '../data-architecture-guard.mjs';

const hitsOf = (text, path = 'apps/web/app/x/actions.ts') =>
  scanSource(text, path).hits;

describe('data-architecture-guard scanner', () => {
  it('counts revalidatePath and flags root/layout scope as broad', () => {
    const text = `
      revalidatePath(APP_ROUTES.DASHBOARD);
      revalidatePath('/');
      revalidatePath(\`/\${handle}\`, 'layout');
      revalidatePath('/settings');`;
    expect(hitsOf(text)).toEqual({
      'revalidate-path': 4,
      'revalidate-path-broad': 2,
    });
  });

  it('flags cross-tenant family tags but not per-record tags', () => {
    const text = `
      revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
      updateTag('profiles-all');
      revalidateTag(createProfileTag(handle), 'max');
      revalidateTag(CACHE_TAGS.SITEMAP_CATALOG, 'max');`;
    expect(hitsOf(text)).toEqual({ 'global-tag-revalidate': 2 });
  });

  it('ignores comments and prose', () => {
    const text = `
      // router.refresh() used to be here
      /* revalidatePath('/') */
      const s = 'call router.refresh later';`;
    expect(hitsOf(text)).toEqual({});
  });

  it('honours a reasoned data-arch-allow on the line or the line above', () => {
    const text = `
      // data-arch-allow: session switch must re-render the shell
      router.refresh();
      router.refresh(); // data-arch-allow: legacy wizard, tracked in JOV-1
      router.refresh(); // data-arch-allow: short`;
    const scan = scanSource(text, 'apps/web/components/A.tsx');
    expect(scan.hits).toEqual({ 'router-refresh': 1 });
    expect(scan.allowed).toBe(2);
  });

  it('counts route segment configs that block cacheComponents', () => {
    const text = `export const dynamic = 'force-dynamic';
export const revalidate = 3600;
export const runtime = 'nodejs';
export const maxDuration = 60;`;
    expect(hitsOf(text, 'apps/web/app/x/page.tsx')).toEqual({
      'route-segment-config': 2,
      'runtime-nodejs-export': 1,
    });
  });

  it('counts legacy cache APIs', () => {
    const text = `import { unstable_cache } from 'next/cache';
const get = unstable_cache(async () => 1, ['k']);
const other = unstableCache(fn, ['k']);
noStore();
unstable_noStore();`;
    expect(hitsOf(text)).toEqual({ 'unstable-cache': 3, 'no-store': 2 });
  });

  it('flags fetch inside useEffect only', () => {
    const text = `'use client';
useEffect(() => {
  void fetch('/api/a').then(r => r.json());
}, []);
const q = useQuery({ queryFn: ({ signal }) => fetch('/api/b', { signal }) });
api.fetch('/x');`;
    expect(hitsOf(text, 'apps/web/components/A.tsx')).toEqual({
      'fetch-in-effect': 1,
    });
  });

  it('flags polling in client code only', () => {
    const client = `'use client';
useQuery({ queryKey: k, refetchInterval: 5000 });
setInterval(() => refetch(), 1000);`;
    expect(hitsOf(client, 'apps/web/components/A.tsx')).toEqual({ polling: 2 });
    const timer = `'use client';
setInterval(() => setNow(Date.now()), 1000);`;
    expect(hitsOf(timer, 'apps/web/components/Countdown.tsx')).toEqual({});
    expect(
      hitsOf('const a = { refetchInterval: 5 };', 'apps/web/lib/server.ts')
    ).toEqual({});
  });

  it('flags a second DB client outside lib/db, not type imports', () => {
    const text = `import { withRetry } from '@/lib/db/client';
import type { DbOrTransaction } from '@/lib/db/client/types';
import { Pool } from 'pg';
const pool = new Pool({});
const sql = neon(url);`;
    expect(hitsOf(text, 'apps/web/lib/x.ts')).toEqual({ 'db-client-path': 4 });
    expect(hitsOf(text, 'apps/web/lib/db/client/connection.ts')).toEqual({});
  });

  it('flags network I/O inside a transaction', () => {
    const text = `await db.transaction(async tx => {
  await tx.insert(a).values(b);
  await fetch(url);
  await stripe.customers.create({});
});
await fetch(url);`;
    expect(hitsOf(text, 'apps/web/lib/db/x.ts')).toEqual({
      'network-in-transaction': 2,
    });
  });

  it('flags awaited queries in loops but not chunked batches', () => {
    const text = `for (const id of ids) {
  await db.select().from(t).where(eq(t.id, id));
}
for (const batch of chunk(rows, 100)) {
  await db.insert(t).values(batch);
}
while (more) await tx.update(t).set({});`;
    expect(hitsOf(text, 'apps/web/lib/x.ts')).toEqual({
      'await-db-in-loop': 2,
    });
  });

  it('keeps offsets stable when masking', () => {
    const text = "a // b\nc /* d\ne */ f 'g'";
    expect(maskSource(text)).toHaveLength(text.length);
    expect(maskSource(text).split('\n')).toHaveLength(3);
  });

  it('scopes to Next.js app source, not tests or scripts', () => {
    expect(inScope('apps/web/app/page.tsx')).toBe(true);
    expect(inScope('apps/ovie/app/layout.tsx')).toBe(true);
    expect(inScope('apps/web/app/page.test.tsx')).toBe(false);
    expect(inScope('apps/web/scripts/drizzle-migrate.ts')).toBe(false);
    expect(inScope('apps/web/tests/unit/a.ts')).toBe(false);
    expect(inScope('apps/ios/App/a.ts')).toBe(false);
  });

  it('documents every rule it can emit', () => {
    for (const rule of Object.keys(totalsOf({})))
      expect(RULES[rule].length).toBeGreaterThan(30);
  });
});

describe('data-architecture-guard ratchet', () => {
  it('fails a new or grown violation and reports shrinkage as stale', () => {
    const { errors, stale } = checkRatchet(
      { a: { 'router-refresh': 2 }, b: { polling: 1 } },
      { a: { 'router-refresh': 1 }, c: { 'no-store': 3 } }
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/router-refresh 2x \(allowed 1\)/);
    expect(stale).toEqual(['c no-store 3 -> 0']);
  });

  it('lowers but never raises caps, and drops fixed files', () => {
    expect(
      lowerRatchet(
        { a: { polling: 1, 'no-store': 5 }, d: { polling: 1 } },
        { a: { polling: 2, 'no-store': 3 }, c: { polling: 1 } }
      )
    ).toEqual({ a: { polling: 1, 'no-store': 3 } });
  });

  it('rejects a ratchet raised above the base revision', () => {
    expect(
      checkAgainstBase(
        { entries: { a: { polling: 3 }, b: { polling: 1 } } },
        { entries: { a: { polling: 2 } } }
      )
    ).toEqual([
      'ratchet raised for a polling: 2 -> 3',
      'ratchet raised for b polling: 0 -> 1',
    ]);
    expect(checkAgainstBase({ entries: { a: { polling: 3 } } }, null)).toEqual(
      []
    );
  });

  it('totals and ranks offenders', () => {
    const entries = { a: { polling: 1 }, b: { polling: 3, 'no-store': 1 } };
    expect(totalsOf(entries).polling).toBe(4);
    expect(topOffenders(entries, 'polling')).toEqual([
      ['b', 3],
      ['a', 1],
    ]);
  });
});

describe('data-architecture-guard library registry', () => {
  const root = mkdtempSync(join(tmpdir(), 'data-arch-'));
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  writeFileSync(
    join(root, 'apps/web/package.json'),
    JSON.stringify({
      dependencies: { swr: '1', '@tanstack/react-query': '5', react: '19' },
      devDependencies: { redis: '6' },
    })
  );
  const registry = {
    watchedDependencyPattern: '^(?:swr|@tanstack\\/react-query|redis)$',
    libraries: [
      { name: '@tanstack/react-query', apps: ['web'] },
      { name: 'redis', apps: ['ovie'] },
    ],
  };

  it('requires an ADR entry for every data library and respects app scope', () => {
    const errors = checkLibraries(root, registry);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/swr, which has no entry/);
    expect(errors[1]).toMatch(/redis; .* only for ovie/);
  });
});
