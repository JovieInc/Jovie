import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nextConfig as config } from '../next.config.mjs';
import { adapter, materialize, ROUTE_ROOTS } from './routes.mjs';

const temporary = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
  );
});

describe('shared route adapters', () => {
  it('preserves HTTP methods and literal limits without copying handler code', () => {
    const result = adapter(
      "export const runtime = 'nodejs'; export const maxDuration = 60; export async function GET() { throw new Error('shared implementation'); } export const POST = wrappedPost;",
      '@/app/api/hud/route'
    );
    expect(result).toContain("export const runtime = 'nodejs'");
    expect(result).toContain('export const maxDuration = 60');
    expect(result).toContain("export { GET, POST } from '@/app/api/hud/route'");
    expect(result).not.toContain('shared implementation');
  });
  it('retains client error boundaries, metadata and default component identity', () => {
    expect(
      adapter(
        "'use client'; export default function ErrorPage() {}",
        '@/app/error'
      )
    ).toMatch(/^'use client';/);
    expect(
      adapter(
        'export const metadata = makeMetadata(); export default page;',
        '@/app/page'
      )
    ).toContain('export { metadata, default }');
    expect(
      adapter(
        "export { default, generateMetadata } from './shared';",
        '@/app/page'
      )
    ).toContain('export { default, generateMetadata }');
    expect(
      adapter('export const { GET, POST } = handlers;', '@/app/api/auth/route')
    ).toContain('export { GET, POST }');
  });
  it('fails closed on unsupported exports and nonliteral route limits', () => {
    expect(() =>
      adapter(
        'export const maxDuration = LIMIT; export const GET = handler;',
        '@/app/route'
      )
    ).toThrow('Nonliteral route config');
    expect(() => adapter('export const helper = 1;', '@/app/route')).toThrow(
      'No route exports'
    );
  });
  it('includes the existing lookup and upload handlers used by shared controls', async () => {
    const destination = await mkdtemp(path.join(os.tmpdir(), 'ovie-controls-'));
    temporary.push(destination);
    const inventory = await materialize(destination);
    for (const endpoint of [
      'api/spotify/search',
      'api/spotify/fal-analysis',
      'api/images/upload',
      'api/admin/creator-avatar',
    ]) {
      const route = inventory.find(
        entry => entry.source === `${endpoint}/route.ts`
      );
      expect(route, endpoint).toBeDefined();
      expect(
        await readFile(path.join(destination, route.target), 'utf8')
      ).toContain(`from '@/app/${endpoint}/route'`);
    }
  });
  it('projects only selected routes and removes stale adapters while retaining the app shell', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ovie-routes-'));
    temporary.push(dir);
    const source = path.join(dir, 'source');
    const destination = path.join(dir, 'ovie');
    for (const [from] of ROUTE_ROOTS) {
      await mkdir(path.join(source, from), { recursive: true });
      await writeFile(
        path.join(source, from, 'route.ts'),
        'export async function GET() {}'
      );
    }
    await mkdir(path.join(source, '(home)'), { recursive: true });
    await writeFile(
      path.join(source, '(home)/page.tsx'),
      'INVALID JOVIE ONLY CODE'
    );
    await writeFile(
      path.join(source, 'app/(shell)/admin/layout.tsx'),
      'ARTIST LAYOUT MUST NOT BE IMPORTED'
    );
    await mkdir(path.join(destination, 'app/api/stale'), { recursive: true });
    await writeFile(
      path.join(destination, 'app/layout.tsx'),
      'Ovie owns its shell'
    );
    await writeFile(path.join(destination, 'app/api/stale/route.ts'), 'old');
    const inventory = await materialize(destination, source);
    expect(inventory).toHaveLength(ROUTE_ROOTS.length);
    expect(inventory.every(entry => !entry.source.includes('(home)'))).toBe(
      true
    );
    expect(
      await readFile(path.join(destination, 'app/layout.tsx'), 'utf8')
    ).toBe('Ovie owns its shell');
    await expect(
      readFile(path.join(destination, 'app/api/stale/route.ts'))
    ).rejects.toThrow();
    expect(await materialize(destination, source)).toEqual(inventory);
  });
});

describe('independent deployment config', () => {
  it('keeps deep-link queries on local rewrites and starts at Ops', async () => {
    expect(await config.rewrites()).toEqual([
      { source: '/app/ov/:path*', destination: '/app/admin/:path*' },
    ]);
    expect(await config.redirects()).toContainEqual({
      source: '/',
      destination: '/hud',
      permanent: false,
    });
    expect(
      (await config.rewrites()).every(rule => rule.destination.startsWith('/'))
    ).toBe(true);
    expect(config.output).toBe('standalone');
    expect((await config.headers())[0].headers).toContainEqual({
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow, noarchive',
    });
  });
});
