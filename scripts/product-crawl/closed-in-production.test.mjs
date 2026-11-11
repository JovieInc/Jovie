import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isClosedInProduction } from './ready-gate.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEMO_APP_DIR = join(ROOT, 'apps/web/app/demo');
const closed = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./closed-in-production.json', import.meta.url)),
    'utf8'
  )
).routes;

/** Every page route under apps/web/app/demo, as the crawl names it. */
function demoPageRoutes(dir = DEMO_APP_DIR) {
  const routes = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) routes.push(...demoPageRoutes(path));
    else if (entry === 'page.tsx') {
      const rel = relative(join(ROOT, 'apps/web/app'), dir).split(sep);
      routes.push(`/${rel.join('/')}`);
    }
  }
  return routes;
}

// lib/security/production-blocked-routes.ts blocks the whole app/demo tree
// ('/demo' exact and the '/demo/' prefix) outside development. The only
// public demo page, /demo/video, lives in app/(marketing) and is not walked.
test('every production-blocked app/demo page is listed closed', () => {
  const routes = demoPageRoutes();
  assert.ok(routes.includes('/demo/showcase/[surface]'), routes.join(', '));
  for (const route of routes)
    assert.ok(
      isClosedInProduction(route, closed),
      `${route} 404s in production but is not in closed-in-production.json`
    );
  assert.equal(isClosedInProduction('/demo/video', closed), false);
});
