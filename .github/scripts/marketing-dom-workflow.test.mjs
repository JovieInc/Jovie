import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { load } from 'js-yaml';

const source = readFileSync(
  new URL('../workflows/ci.yml', import.meta.url),
  'utf8'
);
const ci = load(source);
const paths = ci.jobs['ci-path-changes'];
const compare = ci.jobs['ci-visual-snapshot-compare'];
const ready = ci.jobs['ci-pr-ready'];
test('real selector covers every rendered marketing input and unrelated API changes stay out', () => {
  const run = paths.steps.find(s =>
    s.run?.includes('MARKETING_DOM_PATTERN=')
  ).run;
  const pattern = run.match(/MARKETING_DOM_PATTERN='([^']+)'/)[1];
  for (const file of [
    'apps/web/app/(marketing)/product/page.tsx',
    'apps/web/app/(home)/home.css',
    'apps/web/components/marketing/device/DeviceScreen.tsx',
    'apps/web/components/site/MarketingFooter.css',
    'apps/web/data/marketing/routeManifest.ts',
    'apps/web/styles/system-b-app.css',
    'apps/web/public/device-bezels/phone.png',
    'apps/web/tests/e2e/utils/route-dom-detector.ts',
    'apps/web/tests/product-screenshots/route-dom-certification.spec.ts',
    'packages/ui/atoms/Button.tsx',
  ]) {
    const r = spawnSync('grep', ['-E', pattern], {
      input: `${file}\n`,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, file);
  }
  assert.equal(
    spawnSync('grep', ['-E', pattern], {
      input: 'apps/web/app/api/health/route.ts\n',
    }).status,
    1
  );
  assert.equal(
    paths.outputs.run_marketing_dom,
    "${{ steps.homepage-visual.outputs.run_marketing_dom || 'false' }}"
  );
});
test('existing compare job builds and certifies selected marketing inputs with exact head and no retries', () => {
  assert.match(compare.if, /run_marketing_dom == 'true'/);
  for (const s of compare.steps.filter(
    s =>
      s.uses?.includes('setup-node-pnpm') ||
      s.uses?.includes('setup-playwright') ||
      s.name === 'Build homepage for rendered snapshot compare'
  ))
    assert.match(s.if, /run_marketing_dom == 'true'/);
  const cert = compare.steps.find(
    s => s.name === 'Certify marketing route DOM invariants'
  );
  assert.equal(
    cert.if,
    "needs.ci-path-changes.outputs.run_marketing_dom == 'true'"
  );
  assert.equal(cert.continueOnError ?? cert['continue-on-error'], undefined);
  assert.equal(cert.env.EXPECTED_COMMIT_SHA, '${{ github.sha }}');
  assert.equal(cert.env.ROUTE_DOM_CERTIFICATION_SCOPE, 'marketing');
  assert.match(cert.run, /--retries=0/);
  assert.match(cert.run, /guard-playwright-artifacts\.mjs"? --run/);
  assert.ok(ready.needs.includes('ci-visual-snapshot-compare'));
});
test('actual PR-ready shell rejects skipped, failed, cancelled and missing selected certification', () => {
  const run = ready.steps.find(s =>
    s.run?.includes('Marketing DOM invariant certification did not pass')
  ).run;
  const block = run.match(/if \[\[ "\$RUN_MARKETING_DOM"[\s\S]*?^\s*fi/m)[0];
  for (const status of ['success', 'skipped', 'failure', 'cancelled', '']) {
    const result = spawnSync('bash', ['-c', block], {
      env: {
        ...process.env,
        RUN_MARKETING_DOM: 'true',
        VISUAL_COMPARE_RESULT: status,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, status === 'success' ? 0 : 1, status);
  }
  assert.equal(
    spawnSync('bash', ['-c', block], {
      env: {
        ...process.env,
        RUN_MARKETING_DOM: 'false',
        VISUAL_COMPARE_RESULT: 'skipped',
      },
    }).status,
    0
  );
});
