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
const marketingDom = ci.jobs['ci-visual-marketing-dom'];
const marketingRoutes = ci.jobs['ci-visual-marketing-routes'];
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
    'apps/web/tests/e2e/utils/route-dom-blank-media.ts',
    'apps/web/tests/e2e/utils/route-dom-outcome-dom.ts',
    'apps/web/tests/e2e/utils/image-contrast-detector.ts',
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
test('split lane builds selected marketing inputs once and certifies them with exact head and no retries', () => {
  assert.match(compare.if, /run_marketing_dom == 'true'/);
  for (const s of compare.steps.filter(
    s =>
      s.uses?.includes('setup-node-pnpm') ||
      s.name === 'Build homepage for rendered snapshot compare' ||
      s.name === 'Package visual compare build' ||
      s.name === 'Upload visual compare build'
  ))
    assert.match(s.if, /run_marketing_dom == 'true'/);
  // The build job publishes exactly the artifact the suite jobs download.
  const upload = compare.steps.find(
    s => s.name === 'Upload visual compare build'
  );
  assert.equal(
    upload.uses,
    'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'
  );
  assert.equal(upload.with.name, 'visual-compare-build-${{ github.run_id }}');
  assert.equal(
    upload.continueOnError ?? upload['continue-on-error'],
    undefined
  );
  // Suite jobs run only on the shared build's success and marketing selection.
  for (const [job, selector] of [
    [marketingDom, 'run_marketing_dom'],
    [marketingRoutes, 'run_marketing_dom'],
  ]) {
    assert.ok(job, 'suite job missing');
    assert.match(
      job.if,
      /needs\.ci-visual-snapshot-compare\.result == 'success'/
    );
    assert.match(job.if, new RegExp(selector + " == 'true'"));
    assert.equal(job.continueOnError ?? job['continue-on-error'], undefined);
    const download = job.steps.find(
      s => s.name === 'Download visual compare build'
    );
    assert.equal(
      download.uses,
      'actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333'
    );
    assert.equal(
      download.with.name,
      'visual-compare-build-${{ github.run_id }}'
    );
    assert.equal(
      download.continueOnError ?? download['continue-on-error'],
      undefined
    );
  }
  const cert = marketingDom.steps.find(
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
  assert.match(cert.run, /--workers=1/);
  assert.match(cert.run, /guard-playwright-artifacts\.mjs"? --run/);
  for (const id of [
    'ci-visual-snapshot-compare',
    'ci-visual-snapshot-homepage',
    'ci-visual-marketing-dom',
    'ci-visual-marketing-routes',
  ])
    assert.ok(ready.needs.includes(id));
});
test('actual PR-ready shell rejects skipped, failed, cancelled and missing selected certification', () => {
  const run = ready.steps.find(s =>
    s.run?.includes('Marketing DOM invariant certification did not pass')
  ).run;
  // Every marketing-gated block must fail closed: shared build, DOM
  // certification, and exact-route capture each get their own check.
  const blocks = [
    ...run.matchAll(/if \[\[ "\$RUN_MARKETING_DOM"[\s\S]*?^\s*fi/gm),
  ].map(m => m[0]);
  assert.equal(blocks.length, 3);
  const blockVars = [
    'VISUAL_COMPARE_RESULT',
    'VISUAL_MARKETING_DOM_RESULT',
    'VISUAL_MARKETING_ROUTES_RESULT',
  ];
  for (const [block, varName] of [
    [blocks[0], blockVars[0]],
    [blocks[1], blockVars[1]],
    [blocks[2], blockVars[2]],
  ]) {
    assert.ok(block.includes(`"$${varName}"`), `${varName} block`);
    for (const status of ['success', 'skipped', 'failure', 'cancelled', '']) {
      const result = spawnSync('bash', ['-c', block], {
        env: {
          ...process.env,
          RUN_MARKETING_DOM: 'true',
          VISUAL_COMPARE_RESULT: 'success',
          VISUAL_HOMEPAGE_RESULT: 'success',
          VISUAL_MARKETING_DOM_RESULT: 'success',
          VISUAL_MARKETING_ROUTES_RESULT: 'success',
          [varName]: status,
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
          VISUAL_HOMEPAGE_RESULT: 'skipped',
          VISUAL_MARKETING_DOM_RESULT: 'skipped',
          VISUAL_MARKETING_ROUTES_RESULT: 'skipped',
        },
      }).status,
      0
    );
  }
});
test('marketing routes suite also runs the exact marketing route spec pre-merge, unskipped and unforked from screenshots.yml', () => {
  const capture = marketingRoutes.steps.find(
    s => s.name === 'Capture exact marketing routes (marketing-routes.spec.ts)'
  );
  assert.ok(capture, 'pre-merge exact-route capture step is missing');
  assert.equal(
    capture.if,
    "needs.ci-path-changes.outputs.run_marketing_dom == 'true'"
  );
  assert.equal(
    capture.continueOnError ?? capture['continue-on-error'],
    undefined
  );
  assert.match(capture.run, /guard-playwright-artifacts\.mjs"? --run/);
  assert.match(capture.run, /--retries=0/);
  assert.doesNotMatch(
    capture.run,
    /--grep|-g |--grep-invert|--project=(?!screenshots)/
  );
  const production = load(
    readFileSync(
      new URL('../workflows/screenshots.yml', import.meta.url),
      'utf8'
    )
  ).jobs.generate.steps.find(s => s.name === 'Capture exact marketing routes');
  for (const part of [
    'tests/product-screenshots/marketing-routes.spec.ts',
    '--config=playwright.config.screenshots.ts',
    '--project=screenshots',
    '--workers=4',
  ]) {
    assert.ok(production.run.includes(part), `screenshots.yml lost ${part}`);
    assert.ok(capture.run.includes(part), `pre-merge capture lost ${part}`);
  }
});
test('PR visual review lane runs the same exact marketing route spec on PRs, unskipped', () => {
  const lane = load(
    readFileSync(
      new URL('../workflows/pr-visual-review.yml', import.meta.url),
      'utf8'
    )
  ).jobs.capture;
  const capture = lane.steps.find(
    s => s.name === 'Capture exact marketing routes (marketing-routes.spec.ts)'
  );
  assert.ok(capture, 'PR-time exact-route capture step is missing');
  assert.equal(
    capture.continueOnError ?? capture['continue-on-error'],
    undefined
  );
  assert.doesNotMatch(
    capture.run,
    /--grep|-g |--grep-invert|--project=(?!screenshots)/
  );
  const production = load(
    readFileSync(
      new URL('../workflows/screenshots.yml', import.meta.url),
      'utf8'
    )
  ).jobs.generate.steps.find(s => s.name === 'Capture exact marketing routes');
  for (const part of [
    'tests/product-screenshots/marketing-routes.spec.ts',
    '--config=playwright.config.screenshots.ts',
    '--project=screenshots',
    '--workers=4',
  ]) {
    assert.ok(production.run.includes(part), `screenshots.yml lost ${part}`);
    assert.ok(capture.run.includes(part), `PR-time capture lost ${part}`);
  }
  assert.match(capture.run, /--retries=0/);
  // Artifact secret boundary: same guard as every other Playwright producer
  // (artifact boundary policy test); never an exemption.
  assert.match(
    capture.run,
    /guard-playwright-artifacts\.mjs" --run --\s*\\?\s+pnpm exec playwright test/
  );
});
