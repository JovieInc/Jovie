import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';
import {
  calibrate,
  checkPromotion,
  importSweep,
  normalizeRoute,
} from './calibrate.mjs';
import { DETECTOR_CLASSES, DETECTOR_IDS, runDetectors } from './detectors.mjs';
import {
  blockingFindings,
  routeForFile,
  selectRoutes,
  summarize,
} from './run.mjs';

const requireFromWeb = createRequire(
  new URL('../../../apps/web/package.json', import.meta.url)
);
const { chromium } = requireFromWeb('playwright');
const fixture = name =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const config = JSON.parse(
  readFileSync(
    new URL('./marketing-critic.config.json', import.meta.url),
    'utf8'
  )
);
const rubric = JSON.parse(
  readFileSync(
    new URL(
      '../../../docs/design-system/marketing-critic-rubric.json',
      import.meta.url
    ),
    'utf8'
  )
);

describe('marketing critic detectors (Chromium)', () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await browser?.close();
  });
  const detect = async (html, width = 1440) => {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    try {
      await page.setContent(html, { waitUntil: 'load' });
      return await runDetectors(page, {
        pixelShareMax: config.pixelShareMax,
        focusTabs: 10,
      });
    } finally {
      await page.close();
    }
  };

  it('fires every detector on the deliberate-red fixture', async () => {
    const found = await detect(fixture('red.html'));
    const fired = new Set(found.map(f => f.detector));
    assert.deepEqual(
      [...DETECTOR_IDS].filter(id => !fired.has(id)),
      []
    );
    for (const f of found) assert.equal(f.class, DETECTOR_CLASSES[f.detector]);
    const steps = found.find(f => f.detector === 'step-numbering');
    assert.ok(steps.examples.some(e => e.text === 'Step 1'));
    // React renders `0{n}` as two text nodes around a comment; still one label.
    assert.equal(steps.measurements.count, 3);
  });

  it('stays silent on the clean fixture', async () => {
    const found = await detect(fixture('clean.html'));
    assert.deepEqual(
      found.map(f => `${f.detector}: ${f.message}`),
      []
    );
  });

  it('only reports touch-only copy on desktop widths', async () => {
    const found = await detect(fixture('red.html'), 390);
    assert.ok(!found.some(f => f.detector === 'desktop-touch-copy'));
    assert.ok(found.some(f => f.detector === 'coming-soon-copy'));
  });
});

describe('rubric and config', () => {
  it('maps every detector to a rubric class and a shadow mode', () => {
    const classes = new Set(rubric.classes.map(c => c.id));
    for (const d of rubric.detectors) {
      assert.equal(DETECTOR_CLASSES[d.id], d.class, d.id);
      assert.ok(classes.has(d.class), d.class);
      assert.ok(config.detectorModes[d.id], d.id);
    }
    assert.equal(rubric.detectors.length, DETECTOR_IDS.length);
  });

  it('ships warn-only', () => {
    assert.equal(config.mode, 'shadow');
    assert.equal(config.promoteToBlocking, false);
    assert.deepEqual(
      blockingFindings(
        [{ kind: 'finding', detector: 'step-numbering' }],
        config
      ),
      []
    );
  });
});

describe('route selection', () => {
  it('maps marketing pages to routes and strips route groups', () => {
    assert.equal(
      routeForFile('apps/web/app/(marketing)/smart-links/page.tsx'),
      '/smart-links'
    );
    assert.equal(routeForFile('apps/web/app/(home)/page.tsx'), '/');
    assert.equal(
      routeForFile('apps/web/app/(marketing)/product/[slug]/page.tsx'),
      null
    );
    assert.equal(routeForFile('apps/web/components/marketing/Hero.tsx'), null);
  });

  it('checks only changed pages, or every route for shared inputs', () => {
    assert.deepEqual(
      selectRoutes(['apps/web/app/(marketing)/pay/page.tsx'], config).routes,
      ['/pay']
    );
    assert.equal(
      selectRoutes(['apps/web/components/homepage/Hero.tsx'], config).routes
        .length,
      config.routes.length
    );
    assert.equal(
      selectRoutes(['apps/web/data/marketingCopy.ts'], config).reason,
      'shared-marketing-input'
    );
    assert.deepEqual(
      selectRoutes(['apps/web/app/app/page.tsx'], config).routes,
      []
    );
  });

  it('summarizes findings for the step summary', () => {
    const md = summarize(
      [
        { kind: 'route-run', route: '/pay', width: 1440, status: 'ok' },
        {
          kind: 'finding',
          route: '/pay',
          width: 1440,
          class: 'step-n',
          detector: 'step-numbering',
          message: 'Step numbering.',
          examples: [{ text: 'Step 1' }],
        },
      ],
      { mode: 'shadow' }
    );
    assert.match(md, /\| \/pay \| 1440 \| step-n \| step-numbering \|/);
  });
});

describe('calibration', () => {
  const classes = [...new Set(rubric.detectors.map(d => d.class))];

  it('imports sweep rows as defect and implicit clean labels', () => {
    const labels = importSweep(
      [
        {
          route: '/alternatives_linktree',
          class: 'repeated-titles',
          evidence: 'x',
          widths: [1440],
          severity: 2,
        },
        {
          route: '/pay',
          class: 'other',
          evidence: 'y',
          widths: [1440],
          severity: 1,
        },
      ],
      { classes, source: 's', labeledAt: '2026-10-29' }
    );
    assert.equal(
      normalizeRoute('/alternatives_linktree'),
      '/alternatives/linktree'
    );
    assert.ok(
      labels.some(
        l =>
          l.route === '/alternatives/linktree' &&
          l.class === 'repeated-titles' &&
          l.truth === 'defect'
      )
    );
    assert.ok(
      labels.some(
        l =>
          l.route === '/pay' &&
          l.class === 'repeated-titles' &&
          l.truth === 'clean'
      )
    );
    assert.ok(!labels.some(l => l.class === 'other'));
    // eyebrow-caps was not part of this sweep's vocabulary: no implicit cleans.
    assert.ok(!labels.some(l => l.class === 'eyebrow-caps'));
  });

  it('computes precision and holds promotion until the floors and 7 PR days are met', () => {
    const at = '2026-10-29T00:00:00Z';
    const run = (route, fired) => [
      { kind: 'route-run', status: 'ok', source: 'pr', route, at, runId: 'r1' },
      ...fired.map(detector => ({
        kind: 'finding',
        source: 'pr',
        route,
        at,
        runId: 'r1',
        detector,
      })),
    ];
    const observations = [
      ...run('/a', ['step-numbering']),
      ...run('/b', ['step-numbering']),
      ...run('/c', []),
    ];
    const labels = [
      { route: '/a', class: 'step-n', truth: 'defect' },
      { route: '/b', class: 'step-n', truth: 'clean' },
      { route: '/c', class: 'step-n', truth: 'defect' },
    ];
    const result = calibrate({ observations, labels, config });
    const d = result.detectors['step-numbering'];
    assert.deepEqual([d.tp, d.fp, d.fn, d.tn], [1, 1, 1, 0]);
    assert.equal(d.precision, 0.5);
    assert.equal(d.mayBlock, false);
    assert.ok(d.why.some(w => w.includes('days of PR runs')));
    assert.deepEqual(checkPromotion(result, config), []);
    const promoted = {
      ...config,
      promoteToBlocking: true,
      detectorModes: { ...config.detectorModes, 'step-numbering': 'blocking' },
    };
    const forced = calibrate({ observations, labels, config: promoted });
    assert.match(
      checkPromotion(forced, promoted)[0],
      /step-numbering is blocking but fails the floors/
    );
  });
});
