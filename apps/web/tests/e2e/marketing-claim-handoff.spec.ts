import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createElement, type KeyboardEvent, type MouseEvent } from 'react';
import { renderToString } from 'react-dom/server';
import { MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES } from '@/lib/agent-os/visual-qa/coverage';
import {
  assertRegisteredQualityChecks,
  isRouteCoverageEntry,
} from '../visual-qa/route-quality';

// This fixture proves the browser handoff contract without an app, credentials,
// or the destination's auth/claim runtime. The required marketing capture runs
// the same helper against the actual candidate-rendered source pages.
type Scenario =
  | 'valid'
  | 'client-navigation'
  | 'wrong-client-navigation'
  | 'delayed-prevent-click'
  | 'delayed-valid'
  | 'missing-hydration'
  | 'target-blank'
  | 'window-open'
  | 'missing-hero'
  | 'prevent-hero'
  | 'missing'
  | 'hidden'
  | 'wrong-href'
  | 'wrong-query'
  | 'wrong-origin'
  | 'prevent-click'
  | 'prevent-enter'
  | 'wrong-after-hydration'
  | 'wrong-after-click'
  | 'history-only';

function fixtureView(
  h: typeof createElement,
  route: string,
  scenario: Scenario
) {
  const href =
    scenario === 'wrong-href'
      ? '/signup'
      : scenario === 'wrong-query'
        ? '/start?plan=pro'
        : scenario === 'wrong-origin'
          ? 'https://wrong.invalid/start'
          : '/start';
  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (scenario === 'prevent-click' || scenario === 'delayed-prevent-click') {
      event.preventDefault();
    } else if (scenario === 'wrong-after-click') {
      event.preventDefault();
      location.assign(new URL('/pricing', location.origin).href);
    } else if (scenario === 'history-only') {
      event.preventDefault();
      history.pushState({}, '', '/start');
    } else if (scenario === 'window-open') {
      event.preventDefault();
      window.open('/start');
    } else if (
      scenario === 'client-navigation' ||
      scenario === 'wrong-client-navigation'
    ) {
      event.preventDefault();
      const target =
        scenario === 'wrong-client-navigation' ? '/pricing' : '/start';
      await fetch(`${target}?_rsc=fixture`, { headers: { RSC: '1' } });
      location.assign(target);
    }
  };
  return h(
    'main',
    null,
    h('a', { href: '/start' }, 'Header claim link'),
    route === '/artist-profiles'
      ? h(
          'section',
          { 'data-testid': 'artist-profile-section-hero' },
          scenario === 'missing' || scenario === 'missing-hero'
            ? null
            : h(
                'a',
                {
                  href,
                  hidden: scenario === 'hidden',
                  target: scenario === 'target-blank' ? '_blank' : undefined,
                  'data-testid': 'homepage-primary-cta',
                  onClick:
                    scenario === 'prevent-hero'
                      ? (event: MouseEvent<HTMLAnchorElement>) =>
                          event.preventDefault()
                      : onClick,
                  onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => {
                    if (scenario === 'prevent-enter' && event.key === 'Enter')
                      event.preventDefault();
                  },
                },
                'Claim your profile'
              )
        )
      : null,
    h(
      'section',
      { 'data-testid': 'marketing-section-cta' },
      scenario === 'missing'
        ? null
        : h(
            'a',
            {
              href,
              hidden: scenario === 'hidden',
              target: scenario === 'target-blank' ? '_blank' : undefined,
              'data-testid':
                route === '/about' ? undefined : 'final-cta-action',
              onClick,
              onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => {
                if (scenario === 'prevent-enter' && event.key === 'Enter')
                  event.preventDefault();
              },
            },
            'Claim your profile'
          )
    )
  );
}

let clientBundle: Promise<string> | undefined;
async function bundleFixtureClient() {
  const webRoot = dirname(dirname(__dirname));
  const { build } = await import('vite');
  const directory = await mkdtemp(join(tmpdir(), 'marketing-handoff-react-'));
  const entry = join(directory, 'client.mjs');
  try {
    await writeFile(
      entry,
      `
      import { createElement, useLayoutEffect } from 'react';
      import { hydrateRoot } from 'react-dom/client';
      const view = ${fixtureView.toString()};
      const { route, scenario } = window.handoffFixture;
      function Fixture() {
        useLayoutEffect(() => {
          if (scenario === 'wrong-after-hydration') document.querySelector('section a').href = '/pricing';
        }, []);
        return view(createElement, route, scenario);
      }
      const hydrate = () => hydrateRoot(document.getElementById('fixture-root'), createElement(Fixture));
      if (scenario === 'delayed-prevent-click' || scenario === 'delayed-valid') setTimeout(hydrate, 250);
      else if (scenario !== 'missing-hydration') hydrate();
    `
    );
    const result = await build({
      root: webRoot,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: [
          {
            find: /^react$/,
            replacement: join(webRoot, 'node_modules/react/index.js'),
          },
          {
            find: /^react-dom\/client$/,
            replacement: join(webRoot, 'node_modules/react-dom/client.js'),
          },
        ],
      },
      define: { 'process.env.NODE_ENV': '"production"' },
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'MarketingHandoffFixture' },
      },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const bundle = bundles[0];
    if (bundles.length !== 1 || !bundle || !('output' in bundle))
      throw new Error('Fixture bundle unavailable');
    const chunk = bundle.output.find(output => output.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk')
      throw new Error('Fixture browser entry missing');
    return chunk.code;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function fixture(route: string, scenario: Scenario) {
  const script = await (clientBundle ??= bundleFixtureClient());
  let sourceLoads = 0;
  let targetLoads = 0;
  const server = createServer((request, response) => {
    if (request.url === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    if (request.url === '/fixture-client.js') {
      response
        .writeHead(200, { 'content-type': 'text/javascript' })
        .end(script);
      return;
    }
    if (request.url !== route) {
      targetLoads++;
      response
        .writeHead(503)
        .end('Auth/claim runtime deliberately unavailable');
      return;
    }
    sourceLoads++;
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(`<!doctype html>
      <html><head><title>CTA contract fixture</title></head><body>
      <div id="fixture-root">${renderToString(fixtureView(createElement, route, scenario))}</div>
      <script>window.handoffFixture = ${JSON.stringify({ route, scenario })};</script>
      <script src="/fixture-client.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture did not bind');
  return {
    url: `http://127.0.0.1:${address.port}${route}`,
    counts: () => ({ sourceLoads, targetLoads }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

function entryFor(route: string) {
  const entry = MARKETING_EXACT_ROUTE_VISUAL_QA_ENTRIES.find(
    item => isRouteCoverageEntry(item) && item.source.expectedPath === route
  );
  if (!entry || !isRouteCoverageEntry(entry))
    throw new Error(`Unregistered ${route}`);
  // Isolate the new navigation contract; the real capture retains every
  // registered accessibility, layout, focus, motion and error check.
  return { ...entry, qualityChecks: [] };
}

test.describe.configure({ mode: 'default' });

for (const route of ['/about', '/artist-profiles']) {
  for (const width of [390, 1440]) {
    test(`${route} ${width}: mouse and Enter hand off while the auth runtime is red`, async ({
      page,
    }) => {
      const source = await fixture(route, 'valid');
      try {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(source.url);
        await assertRegisteredQualityChecks(page, entryFor(route), {
          handoffTimeoutMs: 500,
        });
        await expect(page).toHaveURL(source.url);
        expect(source.counts()).toEqual({
          sourceLoads: route === '/about' ? 3 : 5,
          targetLoads: 0,
        });
        expect(page.context().pages()).toHaveLength(1);
      } finally {
        await source.close();
      }
    });
  }

  test(`${route}: client navigation reaches the exact document handoff`, async ({
    page,
  }) => {
    const source = await fixture(route, 'client-navigation');
    try {
      await page.goto(source.url);
      await assertRegisteredQualityChecks(page, entryFor(route), {
        handoffTimeoutMs: 500,
      });
      expect(source.counts()).toEqual({
        sourceLoads: route === '/about' ? 3 : 5,
        targetLoads: 0,
      });
    } finally {
      await source.close();
    }
  });

  test(`${route}: waits for delayed React hydration`, async ({ page }) => {
    const source = await fixture(route, 'delayed-valid');
    try {
      await page.goto(source.url);
      await assertRegisteredQualityChecks(page, entryFor(route), {
        handoffTimeoutMs: 500,
      });
      expect(source.counts()).toEqual({
        sourceLoads: route === '/about' ? 3 : 5,
        targetLoads: 0,
      });
    } finally {
      await source.close();
    }
  });

  for (const scenario of [
    'missing',
    'hidden',
    'wrong-href',
    'wrong-query',
    'wrong-origin',
    'prevent-click',
    'prevent-enter',
    'wrong-after-hydration',
    'wrong-after-click',
    'history-only',
    'delayed-prevent-click',
    'missing-hydration',
    'wrong-client-navigation',
    'target-blank',
    'window-open',
    ...(route === '/artist-profiles'
      ? (['missing-hero', 'prevent-hero'] as const)
      : []),
  ] as const) {
    test(`${route}: rejects ${scenario}`, async ({ page }) => {
      const source = await fixture(route, scenario);
      try {
        await page.goto(source.url);
        // Negative controls shorten only this fixture's expected assertion
        // window. The production producer keeps its configured deadlines.
        await expect(
          assertRegisteredQualityChecks(page, entryFor(route), {
            handoffTimeoutMs: 500,
          })
        ).rejects.toThrow();
        await expect(page).toHaveURL(source.url);
        expect(source.counts().targetLoads).toBe(0);
        expect(page.context().pages()).toHaveLength(1);
      } finally {
        await source.close();
      }
    });
  }
}
