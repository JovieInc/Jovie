import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const removed = [
  'feature-flags',
  'dashboard/approvals',
  'dashboard/retargeting/attribution',
  'referrals/apply',
  'referrals/code',
  'referrals/stats',
  'dsp/bio-sync/status',
  'youtube-library/links',
  'pre-save/spotify/start',
  'connectors/youtube/thumbnails/apply',
  'merch/mockups',
  'admin/ingestion-health',
  'admin/hud/what-shipped',
  'ops/humanize-pr-title',
  'release-to-revenue/trigger',
  'dev/test-user/set-trial-state',
];
const external = [
  'hud/hermes-events',
  'ovie/certifications/metrics',
  'ovie/ingest',
  'internal/ovie/lyb-mrr',
  'internal/release-communications/merge-events',
];

test('pruned routes stay deleted and external routes stay inventoried', () => {
  const guides = ['docs/AI_AGENT_GUIDE.md', 'docs/API_ROUTE_MAP.md'].map(path =>
    readFileSync(resolve(root, path), 'utf8')
  );

  for (const route of removed) {
    assert.equal(
      existsSync(resolve(root, 'apps/web/app/api', route, 'route.ts')),
      false,
      `/api/${route} must remain pruned`
    );
    for (const guide of guides)
      assert.ok(!guide.includes(`| \`/api/${route}\` |`));
  }
  for (const route of external) {
    assert.equal(
      existsSync(resolve(root, 'apps/web/app/api', route, 'route.ts')),
      true,
      `/api/${route} external contract is missing`
    );
    for (const guide of guides)
      assert.ok(guide.includes(`| \`/api/${route}\` |`));
  }
});
