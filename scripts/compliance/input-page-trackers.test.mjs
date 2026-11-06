// Static guard: no third-party tracker component is mounted on a route where
// people type (signin, signup, onboarding, chat/dashboard, billing, claim,
// waitlist, release alerts). Canon: gbrain
// decisions/company/privacy-tracking-compliance-guidelines-2026-10-31.
// Catches the CIPA wiretap pattern (pixel + typed phone/email) before merge.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const APP = join(ROOT, 'apps/web/app');
export const TRACKER_COMPONENTS = [
  'MetaPixel',
  'GoogleAnalytics',
  'InstantlyPixel',
  'EditorialRetargeting',
];
export const INPUT_ROUTE_DIRS = [
  '(auth)',
  'onboarding',
  'app',
  'account',
  'billing',
  'claim',
  'waitlist',
  'artist-selection',
  'auth',
  'auth-return',
  'desktop-auth',
  'mobile-auth-return',
  '[username]/alerts',
];
// Every file that mounts a tracker component, with why it is allowed. Shrink
// only: a new mount fails until it is justified here and in

const KNOWN_MOUNTS = {
  'apps/web/app/layout.tsx':
    'GoogleAnalytics is inactive (no measurement ID). InstantlyPixel is route-allowlisted and returns null. Activating GA needs an input-route exclusion first.',
  'apps/web/app/[username]/page.tsx':
    'Meta pixel on public artist profiles (registry: meta).',
  'apps/web/app/(marketing)/blog/[slug]/page.tsx':
    'EditorialRetargeting fires only on approved paid-promotion articles. Open conflict: articles carry an email signup, so an approved article becomes an input page (counsel brief Q4).',
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const mountRe = new RegExp(`<(${TRACKER_COMPONENTS.join('|')})\\b`);

export function mounts(text) {
  return mountRe.test(text);
}

test('mount detector sees a tracker element and ignores prose', () => {
  assert.equal(mounts('return <MetaPixel pixelIds={ids} />'), true);
  assert.equal(mounts('// MetaPixel used to live here'), false);
});

test('no tracker component on input routes', () => {
  const offenders = [];
  for (const dir of INPUT_ROUTE_DIRS) {
    let files = [];
    try {
      files = walk(join(APP, dir));
    } catch {
      continue;
    }
    for (const f of files) {
      if (mounts(readFileSync(f, 'utf8'))) offenders.push(relative(ROOT, f));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `tracker mounted on an input route: ${offenders.join(', ')}`
  );
});

test('every app route that mounts a tracker is justified (shrink-only)', () => {
  const found = walk(APP)
    .filter(f => mounts(readFileSync(f, 'utf8')))
    .map(f => relative(ROOT, f))
    .sort();
  assert.deepEqual(found, Object.keys(KNOWN_MOUNTS).sort());
});
