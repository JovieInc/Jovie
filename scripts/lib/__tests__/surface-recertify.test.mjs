import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'vitest';
import { sourceDigest } from '../../design-surface-census.mjs';
import {
  renewGroup,
  requiresAuth,
  routePath,
  staleGroups,
  validateCapture,
} from '../surface-recertify.mjs';

const PAGE = 'apps/web/app/(marketing)/pricing/page.tsx';
const OWNER = 'apps/web/components/site/MarketingFooter.tsx';

function repo(pageSources = [PAGE]) {
  const root = mkdtempSync(join(tmpdir(), 'recertify-'));
  for (const file of [...pageSources, OWNER]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `content of ${file}`);
  }
  const group = {
    id: 'pricing',
    area: 'marketing',
    importance: { acquisition: 3, revenue: 3, usage: 3 },
    status: 'canonical',
    expectedOwners: [OWNER],
    evidence: {
      kind: 'certification',
      at: '2026-10-01T00:00:00Z',
      ref: 'old evidence',
    },
    sources: pageSources,
  };
  const census = { groups: [group] };
  group.evidence.sourceDigest = sourceDigest(root, {
    source: pageSources[0],
    expectedOwners: [OWNER],
  });
  return { root, census, group };
}
const shot = width => ({
  width,
  status: 200,
  finalPath: '/pricing',
  sha256: 'a'.repeat(64),
  bytes: 90_000,
  scrollWidth: width,
  clientWidth: width,
  pageErrors: [],
});
const capture = {
  id: 'pricing',
  route: '/pricing',
  shots: [shot(1440), shot(390)],
};

test('a certified surface with unchanged bytes is not stale', () => {
  const { root, census } = repo();
  assert.deepEqual(staleGroups(root, census), []);
});

test('changing an owner file makes the group stale with the new digest', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [stale] = staleGroups(root, census);
  assert.equal(stale.id, 'pricing');
  assert.equal(stale.route, '/pricing');
  assert.equal(stale.recertifiable, true);
  assert.equal(
    stale.digest,
    sourceDigest(root, { source: PAGE, expectedOwners: [OWNER] })
  );
});

test('dynamic routes and multi-source groups are never recertified blindly', () => {
  const dynamic = repo(['apps/web/app/(marketing)/[slug]/page.tsx']);
  writeFileSync(join(dynamic.root, OWNER), 'edited');
  assert.equal(
    staleGroups(dynamic.root, dynamic.census)[0].recertifiable,
    false
  );
  const multi = repo([PAGE, 'apps/web/app/(marketing)/pricing/other/page.tsx']);
  multi.census.groups[0].evidence.sourceDigest = 'stale';
  assert.equal(staleGroups(multi.root, multi.census)[0].recertifiable, false);
});

test('capture must prove a real render at 1440 and 390', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  validateCapture(capture, group);
  assert.throws(
    () => validateCapture({ ...capture, shots: [shot(1440)] }, group),
    /missing 390px/
  );
  assert.throws(
    () =>
      validateCapture(
        { ...capture, shots: [shot(1440), { ...shot(390), status: 500 }] },
        group
      ),
    /HTTP 500/
  );
  assert.throws(
    () =>
      validateCapture(
        {
          ...capture,
          shots: [{ ...shot(1440), scrollWidth: 1500 }, shot(390)],
        },
        group
      ),
    /horizontal overflow/
  );
  assert.throws(
    () => validateCapture({ ...capture, route: '/x' }, group),
    /route mismatch/
  );
});

test('a signed-out redirect or failed test sign-in never renews a surface', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  // /app/* without a session answers 200 on /signin: that must not certify.
  assert.throws(
    () =>
      validateCapture(
        {
          ...capture,
          shots: [shot(1440), { ...shot(390), finalPath: '/signin' }],
        },
        group
      ),
    /390px redirected to \/signin/
  );
  assert.throws(
    () =>
      validateCapture(
        { ...capture, shots: [{ ...shot(1440), authStatus: 500 }, shot(390)] },
        group
      ),
    /1440px test sign-in HTTP 500/
  );
  const { finalPath: _omit, ...legacy } = shot(1440);
  assert.throws(
    () => validateCapture({ ...capture, shots: [legacy, shot(390)] }, group),
    /1440px final path not recorded/
  );
  validateCapture(
    { ...capture, shots: [{ ...shot(1440), authStatus: 200 }, shot(390)] },
    group
  );
});

test('route helpers normalise paths and flag app routes for sign-in', () => {
  assert.equal(routePath('/pricing/'), '/pricing');
  assert.equal(routePath('/'), '/');
  assert.equal(routePath('/app/contacts?tab=audience'), '/app/contacts');
  assert.equal(requiresAuth('/app'), true);
  assert.equal(requiresAuth('/app/contacts'), true);
  assert.equal(requiresAuth('/apple'), false);
  assert.equal(requiresAuth('/pricing'), false);
});

test('renewal writes the real digest, evidence pointers and keeps prior history', () => {
  const { root, census } = repo();
  writeFileSync(join(root, OWNER), 'edited');
  const [group] = staleGroups(root, census);
  const next = renewGroup(census, group, {
    capture,
    at: '2026-10-29T20:00:00.000Z',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    artifactName: 'surface-recert-1',
    sha: 'abcdef1234567890',
  });
  const evidence = next.groups[0].evidence;
  assert.equal(evidence.sourceDigest, group.digest);
  assert.equal(evidence.at, '2026-10-29T20:00:00.000Z');
  assert.match(evidence.ref, /abcdef123/);
  assert.match(evidence.ref, /surface-recert-1/);
  assert.match(evidence.ref, /1440px sha256 a{64}/);
  assert.match(evidence.ref, /Prior: old evidence$/);
  assert.deepEqual(staleGroups(root, next), []);
  // A second renewal replaces, never stacks, the generated sentence.
  writeFileSync(join(root, OWNER), 'edited again');
  const [again] = staleGroups(root, next);
  const twice = renewGroup(next, again, {
    capture,
    at: '2026-10-29T21:00:00.000Z',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/2',
    artifactName: 'surface-recert-2',
    sha: '0123456789abcdef',
  });
  assert.equal(
    twice.groups[0].evidence.ref.match(/Automatic recertification/g).length,
    1
  );
});
