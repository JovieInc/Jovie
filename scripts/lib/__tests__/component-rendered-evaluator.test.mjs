import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  collectSnapshots,
  storyCandidates,
} from '../../component-rendered-evaluator.mjs';
import { evaluateRenderedSnapshots } from '../../component-rendered-invariant-policy.mjs';

const requireFromWeb = createRequire(
  new URL('../../../apps/web/package.json', import.meta.url)
);
const { chromium } = requireFromWeb('playwright');

const BADGE = './packages/ui/atoms/Badge.stories.tsx';
const CATALOG =
  './apps/web/components/marketing/storybook/MarketingSections.stories.tsx';
// biome-ignore format: compact fixture keeps this source-PR under the hard size cap
const index = rows => ({ entries: Object.fromEntries(rows.map(([id, importPath, extra = {}]) => [id, { id, importPath, tags: ['jovie-certification'], type: 'story', ...extra }])) });
const ids = result => result.stories.map(story => story.id);

describe('rendered evaluator story selection', () => {
  it('matches actual Storybook 10 app-relative index paths without matching legacy suffixes', () => {
    const observed = index([
      [
        'marketing-device--public-profile',
        './components/marketing/device/DeviceScreen.stories.tsx',
        { exportName: 'PublicProfile' },
      ],
      [
        'legacy-device--public-profile',
        './apps/web/legacy/components/marketing/device/DeviceScreen.stories.tsx',
        { exportName: 'PublicProfile' },
      ],
    ]);
    const selected = storyCandidates(observed, {
      components: [],
      storyPaths: [
        'apps/web/components/marketing/device/DeviceScreen.stories.tsx#PublicProfile',
      ],
    });
    expect(ids(selected)).toEqual(['marketing-device--public-profile']);
    expect(selected.missingRequests).toEqual([]);
  });

  it('tracks selected and missing requests independently', () => {
    // biome-ignore format: compact fixture keeps this source-PR under the hard size cap
    const result = storyCandidates(index([['badge--certified', BADGE], ['marketing-sections--legacy', CATALOG, { tags: [] }]]), { components: ['packages/ui/atoms/Badge.tsx', 'packages/ui/atoms/Missing.tsx'], storyPaths: ['apps/web/components/marketing/storybook/MarketingSections.stories.tsx', 'apps/web/components/missing/MissingStory.stories.tsx'] });
    expect(ids(result)).toEqual([
      'marketing-sections--legacy',
      'badge--certified',
    ]);
    expect(result.missingRequests).toEqual([
      'apps/web/components/missing/MissingStory.stories.tsx',
      'packages/ui/atoms/Missing.tsx',
    ]);
  });

  it('uses exact paths, TS/JS extensions, and exact catalog exports', () => {
    // biome-ignore format: compact fixture keeps this source-PR under the hard size cap
    const stories = index([['duplicate--suffix', './apps/web/legacy/packages/ui/atoms/Badge.stories.tsx'], ['badge--certified', BADGE], ['helper--certified', './packages/ui/atoms/Helper.stories.ts'], ['avatar--certified', './packages/ui/atoms/Avatar.stories.jsx'], ['marketing-sections--unrelated', CATALOG], ['marketing-sections--legacy-panel', CATALOG, { name: 'Legacy Panel' }], ['marketing-sections--action-coverage', CATALOG, { exportName: 'ActionCoverage' }]]);
    const adjacent = storyCandidates(stories, {
      components: [
        'packages/ui/atoms/Badge.tsx',
        'packages/ui/atoms/Helper.ts',
        'packages/ui/atoms/Avatar.jsx',
      ],
      storyPaths: [],
    });
    const catalog = storyCandidates(stories, {
      components: [],
      storyPaths: [
        'apps/web/components/marketing/storybook/MarketingSections.stories.tsx#LegacyPanel',
        'apps/web/components/marketing/storybook/MarketingSections.stories.tsx#ActionCoverage',
      ],
    });
    expect(ids(adjacent)).toEqual([
      'badge--certified',
      'helper--certified',
      'avatar--certified',
    ]);
    expect(ids(catalog)).toEqual([
      'marketing-sections--legacy-panel',
      'marketing-sections--action-coverage',
    ]);
  });
});

// The same browser collector used by the ship gate must identify and exercise
// the intended control. Fixture requests are intercepted; no app/API is called.
describe('rendered evaluator declared keyboard target', () => {
  let browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  }, 60_000);

  async function observe({
    selector = 'button[data-testid="homepage-primary-cta"]',
    omitSelector = false,
    disabled = false,
    keydown = '',
    extraButton = '',
  } = {}) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const declared = omitSelector
      ? ''
      : `data-jovie-eval-keyboard-target-selector="${selector.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`;
    const html = `<!doctype html><html lang="en"><head><title>Claim fixture</title>
      <style>
        :root { --color-bg-base: #fff; --space-0: 0px; --radius-none: 0px; }
        body { margin: 0; color: #111; background: #fff; }
        [data-jovie-eval-family] { background: var(--color-bg-base); }
        [data-jovie-eval-variant] { padding: 0; border-radius: 0; }
      </style></head><body><main id="storybook-root">
      <div data-jovie-eval-family="claim-fixture" data-jovie-eval-owner="ClaimFixture"
        data-jovie-eval-theme="light" data-jovie-eval-surface-token="--color-bg-base"
        data-jovie-eval-mapping='{"current-story":"neutral"}'>
        <div data-jovie-eval-variant="current-story" data-jovie-eval-target="true"
          data-jovie-eval-tone="neutral" data-jovie-eval-padding-x="--space-0"
          data-jovie-eval-padding-y="--space-0" data-jovie-eval-radius="--radius-none"
          data-jovie-eval-interactive="true" ${declared}>
          <form onsubmit="event.preventDefault()">
            <input aria-label="Choose your handle" name="handle">
            <button type="submit" data-testid="homepage-primary-cta"
              ${disabled ? 'disabled' : ''} onkeydown="${keydown}">Claim</button>
            ${extraButton}
          </form>
        </div>
      </div></main></body></html>`;
    await page.route('http://renderer.test/**', route =>
      route.fulfill({ contentType: 'text/html', body: html })
    );
    try {
      return await collectSnapshots(
        page,
        { id: 'fixture--claim' },
        { name: 'desktop', width: 1280, height: 900 },
        'http://renderer.test'
      );
    } finally {
      await context.close();
    }
  }

  it('activates the declared Claim button despite the preceding text input', async () => {
    const snapshots = await observe();
    expect(snapshots[0].variants[0].keyboardActivatable).toBe(true);
    expect(snapshots[0].variants[0]).toMatchObject({
      keyboardTargetMatchCount: 1,
      keyboardTargetTag: 'BUTTON',
      keyboardTargetTestId: 'homepage-primary-cta',
      keyboardReachable: true,
      keyboardActivatable: true,
      tabbableCount: 2,
    });
    expect(evaluateRenderedSnapshots(snapshots).ok).toBe(true);
  });

  it('retains Space activation when Enter is prevented on the intended button', async () => {
    const snapshots = await observe({
      keydown: "if(event.key==='Enter')event.preventDefault()",
    });
    expect(snapshots[0].variants[0].keyboardActivatable).toBe(true);
    expect(evaluateRenderedSnapshots(snapshots).ok).toBe(true);
  });

  it.each([
    ['missing', { selector: '#missing' }],
    ['ambiguous', { selector: 'input, button' }],
    ['disabled', { disabled: true }],
  ])(
    'rejects a %s explicit target without falling back to another control',
    async (_name, options) => {
      const snapshots = await observe(options);
      expect(snapshots[0].variants[0]).toMatchObject({
        keyboardTargetTag: null,
        keyboardReachable: false,
        keyboardActivatable: false,
      });
      const report = evaluateRenderedSnapshots(snapshots);
      expect(report.ok).toBe(false);
      expect(report.results[0].issues.map(issue => issue.rule)).toEqual(
        expect.arrayContaining([
          'keyboard-path-missing',
          'keyboard-activation-missing',
        ])
      );
    }
  );

  it.each([
    ['default text input', { omitSelector: true }],
    ['explicit text input', { selector: 'input' }],
    [
      'unrelated click',
      {
        keydown:
          "event.preventDefault();document.getElementById('other').click()",
        extraButton: '<button id="other" type="button">Other action</button>',
      },
    ],
  ])('keeps %s as a negative activation control', async (_name, options) => {
    const snapshots = await observe(options);
    expect(snapshots[0].variants[0].keyboardReachable).toBe(true);
    expect(snapshots[0].variants[0].keyboardActivatable).toBe(false);
    const report = evaluateRenderedSnapshots(snapshots);
    expect(report.ok).toBe(false);
    expect(report.results[0].issues.map(issue => issue.rule)).toContain(
      'keyboard-activation-missing'
    );
  });

  it('fails closed on an invalid explicit selector', async () => {
    await expect(observe({ selector: '[' })).rejects.toThrow();
  });
});
