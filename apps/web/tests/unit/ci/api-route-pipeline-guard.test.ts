import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import legacyRoutes from './fixtures/api-route-pipeline-legacy.json';

/**
 * Every `app/api` route handler goes through `defineRoute`
 * (`lib/api/route-pipeline.ts`): one place for access, rate limiting, input
 * validation, the error shape and no-store headers.
 *
 * `fixtures/api-route-pipeline-legacy.json` lists the routes written before the
 * pipeline existed. It only shrinks. The checks are per file (no totals, no
 * exact-match snapshot), so two unrelated green PRs cannot combine into a red
 * merge group.
 */

const WEB_ROOT = resolve(__dirname, '../../..');
const API_ROOT = join(WEB_ROOT, 'app/api');
const HTTP_METHODS = 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS';
const METHOD_EXPORT = new RegExp(
  String.raw`^export\s+(?:async\s+function|function|const|let|var)\s+(${HTTP_METHODS})\b`,
  'gm'
);
const NAMED_METHOD_EXPORT = new RegExp(
  String.raw`^export\s*\{[^}]*\b(?:${HTTP_METHODS})\b[^}]*\}`,
  'm'
);

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(path);
    return entry.name === 'route.ts' || entry.name === 'route.tsx'
      ? [relative(WEB_ROOT, path).replaceAll('\\', '/')]
      : [];
  });
}

/** True when every HTTP method the file exports is `export const X = defineRoute(`. */
export function usesRoutePipeline(source: string): boolean {
  if (NAMED_METHOD_EXPORT.test(source)) return false;
  const methods = [...source.matchAll(METHOD_EXPORT)].map(match => match[1]);
  if (methods.length === 0) return false;
  return methods.every(method =>
    new RegExp(
      String.raw`^export const ${method} = defineRoute(?:<[^(]*>)?\(`,
      'm'
    ).test(source)
  );
}

const routeFiles = findRouteFiles(API_ROOT).sort();
const legacy = new Set<string>(legacyRoutes);
const onPipeline = new Set(
  routeFiles.filter(file =>
    usesRoutePipeline(readFileSync(join(WEB_ROOT, file), 'utf8'))
  )
);

describe('api route pipeline guard', () => {
  it('finds the route tree', () => {
    expect(routeFiles.length).toBeGreaterThan(100);
    expect(onPipeline.size).toBeGreaterThan(0);
  });

  it('new routes use defineRoute', () => {
    const offenders = routeFiles.filter(
      file => !onPipeline.has(file) && !legacy.has(file)
    );
    expect(
      offenders,
      'These routes hand-roll their request handling. Export each method as ' +
        '`export const GET = defineRoute({ route, access, ... }, handler)` from ' +
        '@/lib/api/route-pipeline. Do not add them to fixtures/api-route-pipeline-legacy.json: ' +
        'that list only shrinks.'
    ).toEqual([]);
  });

  it('migrated routes leave the legacy list', () => {
    const stale = [...legacy].filter(file => onPipeline.has(file));
    expect(
      stale,
      'These routes now use defineRoute. Remove them from fixtures/api-route-pipeline-legacy.json.'
    ).toEqual([]);
  });

  it('the legacy list names only routes that exist', () => {
    const missing = [...legacy].filter(
      file => !existsSync(join(WEB_ROOT, file))
    );
    expect(
      missing,
      'These routes were deleted or moved. Remove them from fixtures/api-route-pipeline-legacy.json.'
    ).toEqual([]);
  });

  it('recognises pipeline and hand-rolled exports', () => {
    const pipeline = `export const GET = defineRoute(\n  { route: '/x' },\n  h\n);\n`;
    expect(usesRoutePipeline(pipeline)).toBe(true);
    expect(
      usesRoutePipeline(
        `export const POST = defineRoute<Auth, Body>({ route: '/x' }, h);\n`
      )
    ).toBe(true);
    expect(
      usesRoutePipeline(`${pipeline}export async function POST() {}\n`)
    ).toBe(false);
    expect(usesRoutePipeline('export async function GET() {}\n')).toBe(false);
    expect(usesRoutePipeline('export const GET = withOther(h);\n')).toBe(false);
    expect(usesRoutePipeline('export { handler as GET };\n')).toBe(false);
    expect(usesRoutePipeline('export const GET = handler;\n')).toBe(false);
    expect(usesRoutePipeline("export const runtime = 'nodejs';\n")).toBe(false);
  });
});
