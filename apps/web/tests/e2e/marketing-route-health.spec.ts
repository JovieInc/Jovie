/** Blocking anonymous render gate required before marketing migration/import. */

import type { Page } from '@playwright/test';
import {
  getMarketingSection,
  getMarketingSectionRegistryEntry,
  MARKETING_ROUTE_HEALTH_TARGETS,
  MARKETING_ROUTE_MANIFEST,
  type MarketingRouteHealthTarget,
} from '@/data/marketing';
import { expect, test } from './setup';
import { installPublicRouteMocks } from './utils/public-surface-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

const NAVIGATION_TIMEOUT = 300_000;
const BOUNDARY_SELECTORS = [
  '[data-testid="not-found"]',
  '[data-testid="error-boundary"]',
  '[data-testid="error-page"]',
  'next-error-h1',
].join(', ');
const ERROR_TEXT = [
  /application error/i,
  /internal server error/i,
  /unhandled runtime error/i,
  /something went wrong/i,
  /a server-side exception has occurred/i,
  /this page could not be found/i,
  /page not found/i,
];
const AUTH_PATH = /\/(?:auth|login|signin|sign-in|signup|sign-up)(?:\/|$)/i;
const AUTH_SELECTORS =
  '[data-auth-shell], [data-clerk-component], [data-testid="auth-clerk-unavailable"]';

const pathname = (value: string) => new URL(value, 'http://localhost').pathname;

async function assertNoDevChrome(page: Page) {
  await expect(page.locator('html')).toHaveAttribute(
    'data-dev-chrome-disabled',
    '1'
  );
  for (const selector of [
    '[data-testid="dev-toolbar"]',
    '[data-testid="dev-toolbar-flag-drawer"]',
    '[data-vercel-toolbar]',
    '[data-nextjs-dev-tools-button]',
  ]) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
}

async function assertPageHealth(
  page: Page,
  target: MarketingRouteHealthTarget,
  consoleErrors: readonly string[],
  pageErrors: readonly string[],
  failedResponses: readonly string[],
  failedRequests: readonly string[]
) {
  const finalPath = pathname(page.url());
  expect(
    target.expected === 'redirect'
      ? target.allowedFinalPaths.map(pathname)
      : finalPath,
    `${target.glob} did not settle on the declared path`
  ).toEqual(
    target.expected === 'redirect'
      ? expect.arrayContaining([finalPath])
      : pathname(target.path)
  );
  const unexpectedFailedResponses =
    target.expected === 'not-found'
      ? failedResponses.filter(entry => {
          const [status, ...urlParts] = entry.split(' ');
          return (
            status !== '404' ||
            pathname(urlParts.join(' ')) !== pathname(target.path)
          );
        })
      : failedResponses;
  expect(
    unexpectedFailedResponses,
    `${target.glob} has unexpected same-origin 4xx/5xx`
  ).toEqual([]);
  expect(failedRequests, `${target.glob} has failed requests`).toEqual([]);
  expect(consoleErrors, `${target.glob} emitted console errors`).toEqual([]);
  expect(pageErrors, `${target.glob} threw runtime exceptions`).toEqual([]);
  if (target.expected === 'redirect') return;

  await assertNoDevChrome(page);
  if (target.expected === 'not-found') {
    const body = (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .trim();
    expect(body, `${target.glob} did not render its not-found state`).toMatch(
      /not found|could not be found/i
    );
    return;
  }

  await expect(page.locator('main').first()).toBeVisible();
  const body = (await page.locator('body').innerText())
    .replace(/\s+/g, ' ')
    .trim();
  expect(
    body.length,
    `${target.glob} rendered no meaningful body`
  ).toBeGreaterThan(20);
  for (const pattern of ERROR_TEXT) {
    expect(body, `${target.glob} rendered an error signal`).not.toMatch(
      pattern
    );
  }
  await expect(page.locator(BOUNDARY_SELECTORS)).toHaveCount(0);
  if (!target.allowsAuthShell) {
    await expect(page.locator(AUTH_SELECTORS)).toHaveCount(0);
  }
  expect(AUTH_PATH.test(finalPath), `${target.glob} ended on auth path`).toBe(
    false
  );
  if (target.requiresSharedChrome) {
    await expect(page.locator('[data-testid="header-nav"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="marketing-footer"]')).toHaveCount(
      1
    );
  }
}

// Canonical identity is data-testid=marketing-section-{sectionId}.
// Semantic outer sections are included even without metadata, across layout
// divs. Nested cards/semantic sections inside a section are not route beats.
const COMPOSITION_ROOT = 'main';
const SECTION_CENSUS = 'section, [data-testid^="marketing-section-"]';
type MountedSection = {
  sectionId: string;
  variantId: string;
  componentPath: string;
  occurrenceId?: string;
};
type RuntimeFallback = {
  readonly selector: string;
  readonly componentPath: string;
  readonly hiddenWhen: 'scripting-enabled';
};

async function assertMountedSections(
  page: Page,
  route: string,
  expected: readonly MountedSection[],
  runtimeFallbacks: readonly RuntimeFallback[] = [],
  resolveSection = getMarketingSectionRegistryEntry
) {
  const roots = page.locator(COMPOSITION_ROOT);
  if ((await roots.count()) !== 1) {
    throw new Error(
      `[composition-root] ${route}: expected exactly one production composition root`
    );
  }
  const actual = await roots.evaluate(
    (root, { census, fallbacks, route }) => {
      // Only an explicitly declared fallback with matching owner identity is excluded.
      // The current no-script owner uses display:none under scripting:enabled;
      // opacity, zero dimensions or aria-hidden alone do not prove this contract.
      const excludedFallbacks = new Set<Element>();
      for (const fallback of fallbacks) {
        const matches = root.querySelectorAll(fallback.selector);
        if (matches.length !== 1) {
          throw new Error(
            `[runtime-fallback-count] ${route}: ${fallback.selector} matched ${matches.length}, expected one descendant`
          );
        }
        const element = matches[0];
        if (
          element.getAttribute('data-marketing-owner') !==
          fallback.componentPath
        ) {
          throw new Error(
            `[runtime-fallback-owner] ${route}: ${fallback.selector}`
          );
        }
        if (
          fallback.hiddenWhen !== 'scripting-enabled' ||
          !window.matchMedia('(scripting: enabled)').matches
        ) {
          throw new Error(
            `[runtime-fallback-condition] ${route}: scripting-enabled state is not established`
          );
        }
        if (
          getComputedStyle(element).display !== 'none' ||
          element.getClientRects().length !== 0
        ) {
          throw new Error(
            `[runtime-fallback-visible] ${route}: ${fallback.selector} must be display:none in this state`
          );
        }
        if (
          Array.from(excludedFallbacks).some(
            other => other.contains(element) || element.contains(other)
          )
        ) {
          throw new Error(
            `[runtime-fallback-overlap] ${route}: fallback declarations overlap`
          );
        }
        excludedFallbacks.add(element);
      }
      const visible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        for (
          let node: Element | null = element;
          node;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (
            node.hasAttribute('hidden') ||
            style.display === 'none' ||
            style.visibility !== 'visible' ||
            Number(style.opacity) === 0 ||
            style.contentVisibility === 'hidden'
          )
            return false;
        }
        return true;
      };
      return Array.from(root.querySelectorAll(census))
        .filter(element => {
          if (
            Array.from(excludedFallbacks).some(fallback =>
              fallback.contains(element)
            )
          )
            return false;
          for (
            let parent = element.parentElement;
            parent && parent !== root;
            parent = parent.parentElement
          ) {
            if (parent.matches(census)) return false;
          }
          return true;
        })
        .map(element => ({
          sectionId: element
            .getAttribute('data-testid')
            ?.startsWith('marketing-section-')
            ? element
                .getAttribute('data-testid')!
                .slice('marketing-section-'.length)
            : '',
          componentPath: element.getAttribute('data-marketing-owner') ?? '',
          variantId: element.getAttribute('data-marketing-variant') ?? '',
          occurrenceId:
            element.getAttribute('data-marketing-occurrence') ?? undefined,
          visible: visible(element),
        }));
    },
    { census: SECTION_CENSUS, fallbacks: runtimeFallbacks, route }
  );
  for (const section of actual) {
    const registered = resolveSection(section.sectionId);
    if (!registered)
      throw new Error(
        `[unregistered-section] ${route}: ${section.sectionId || '(unmarked child)'}`
      );
    if (!registered.sourceBacked || !registered.resolvedSource) {
      throw new Error(`[unresolved-source] ${route}: ${section.sectionId}`);
    }
    // Owner metadata is identity consistency; import/callsite provenance remains
    // a separate source gate, never established by a stamped path.
    if (
      !getMarketingSection(
        section.sectionId as Parameters<typeof getMarketingSection>[0]
      ).variants.some(
        variant =>
          variant.id === section.variantId && variant.status === 'active'
      )
    ) {
      throw new Error(
        `[unregistered-variant] ${route}: ${section.sectionId}/${section.variantId}`
      );
    }
  }
  if (actual.length < expected.length)
    throw new Error(`[missing-section] ${route}`);
  if (actual.length > expected.length)
    throw new Error(`[duplicate-or-extra-section] ${route}`);
  // Occurrence-preserving comparison: repeated recipe beats remain legal.
  for (const [index, section] of actual.entries()) {
    const wanted = expected[index];
    if (section.sectionId !== wanted.sectionId)
      throw new Error(`[section-order] ${route}: occurrence ${index}`);
    if (section.variantId !== wanted.variantId)
      throw new Error(`[wrong-variant] ${route}: occurrence ${index}`);
    if (section.componentPath !== wanted.componentPath)
      throw new Error(`[wrong-owner] ${route}: occurrence ${index}`);
    if (section.occurrenceId !== wanted.occurrenceId)
      throw new Error(`[occurrence-order] ${route}: occurrence ${index}`);
    if (!section.visible)
      throw new Error(`[runtime-hidden] ${route}: occurrence ${index}`);
  }
}

async function assertRouteSections(
  page: Page,
  target: MarketingRouteHealthTarget
) {
  const entry = MARKETING_ROUTE_MANIFEST.find(
    candidate => candidate.glob === target.glob
  );
  if (!entry) throw new Error(`[manifest-entry] ${target.glob}`);
  if (target.expected !== 'page') return;
  if (entry.healthCheck?.waitFor)
    await expect(page.locator(entry.healthCheck.waitFor)).toBeVisible();
  if (entry.exempt && entry.renderedSections.length === 0) return;
  if (
    entry.bindingEvidence.status === 'unverified' ||
    entry.renderedSections.length === 0
  ) {
    throw new Error(
      `[unverified-bindings] ${target.glob}: production owner reconciliation required`
    );
  }
  const expected = entry.renderedSections.map(binding => {
    if (binding.kind !== 'approved-section' || !binding.variantId) {
      throw new Error(
        `[missing-variant-binding] ${target.glob}: declare the actual mounted variant; do not infer it from registry defaults`
      );
    }
    const componentPath = binding.componentPath.startsWith('apps/')
      ? binding.componentPath
      : `apps/web/${binding.componentPath}`;
    return {
      sectionId: binding.sectionId,
      variantId: binding.variantId,
      componentPath,
      occurrenceId: binding.occurrenceId,
    };
  });
  // Deliberately use renderedSections, not recipe.sectionOrder: pricing,
  // artist-profiles, pay and waitlist keep their explicit parity exceptions.
  await assertMountedSections(
    page,
    entry.url,
    expected,
    entry.healthCheck?.runtimeFallbacks ?? []
  );
}

async function checkTarget(page: Page, target: MarketingRouteHealthTarget) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  const failedRequests: string[] = [];
  const origin = new URL(
    process.env.BASE_URL?.trim() || 'http://localhost:3100'
  ).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    if (request.url().startsWith(origin)) {
      failedRequests.push(
        `${request.url()} ${request.failure()?.errorText ?? 'unknown failure'}`
      );
    }
  });

  await installPublicRouteMocks(page);
  const response = await page.goto(target.path, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT,
  });
  const responseStatus = response?.status() ?? 0;
  if (target.expected === 'not-found') {
    expect(responseStatus, `${target.glob} must remain unpublished`).toBe(404);
  } else {
    expect(
      responseStatus,
      `${target.glob} has no document response`
    ).toBeLessThan(400);
  }
  await page.waitForTimeout(750);
  await assertPageHealth(
    page,
    target,
    consoleErrors,
    pageErrors,
    failedResponses,
    failedRequests
  );
  await assertRouteSections(page, target);
}

test.describe('canonical marketing route health gate', () => {
  test.setTimeout(NAVIGATION_TIMEOUT + 60_000);
  for (const target of MARKETING_ROUTE_HEALTH_TARGETS) {
    test(`${target.glob} → ${target.path}`, async ({ page }) => {
      await checkTarget(page, target);
    });
  }
});

// Same assertion and selector as the real route gate. These local DOM mutations
// isolate section failures without introducing a synthetic route or registry.
test.describe('marketing mounted-section deliberate-red coverage', () => {
  const expected: readonly MountedSection[] = [
    {
      sectionId: 'hero',
      variantId: 'centered-none',
      componentPath: 'fixture-owner',
    },
    {
      sectionId: 'feature-split',
      variantId: 'phone-right',
      componentPath: 'fixture-owner',
      occurrenceId: 'connected',
    },
    {
      sectionId: 'feature-split',
      variantId: 'phone-right',
      componentPath: 'fixture-owner',
      occurrenceId: 'relationships',
    },
    {
      sectionId: 'faq',
      variantId: 'objection-handler',
      componentPath: 'fixture-owner',
    },
  ];
  const cases = [
    {
      name: 'positive including repeated sections',
      mutation: 'none',
      code: null,
    },
    { name: 'missing nonhero', mutation: 'missing', code: 'missing-section' },
    {
      name: 'duplicate nonhero',
      mutation: 'duplicate',
      code: 'duplicate-or-extra-section',
    },
    {
      name: 'reordered nonheroes',
      mutation: 'reordered',
      code: 'section-order',
    },
    {
      name: 'reordered equal-family occurrences',
      mutation: 'occurrence',
      code: 'occurrence-order',
    },
    {
      name: 'wrong registered variant',
      mutation: 'variant',
      code: 'wrong-variant',
    },
    {
      name: 'unregistered unmarked section',
      mutation: 'unregistered',
      code: 'unregistered-section',
    },
    {
      name: 'runtime hidden section',
      mutation: 'hidden',
      code: 'runtime-hidden',
    },
    {
      name: 'noncanonical test ID',
      mutation: 'prefix',
      code: 'unregistered-section',
    },
    {
      name: 'unresolved registered source',
      mutation: 'unresolved',
      code: 'unresolved-source',
    },
  ] as const;
  for (const item of cases) {
    test(item.name, async ({ page }) => {
      await page.setContent(
        `<main><div>${expected
          .map(
            section =>
              `<section data-testid='marketing-section-${section.sectionId}' data-marketing-owner='${section.componentPath}' data-marketing-variant='${section.variantId}'${section.occurrenceId ? ` data-marketing-occurrence='${section.occurrenceId}'` : ''} style='min-height:32px'>Section content</section>`
          )
          .join('')}</div></main>`
      );
      await page.locator(COMPOSITION_ROOT).evaluate((root, mutation) => {
        const container = root.firstElementChild!;
        const children = Array.from(container.children);
        if (mutation === 'missing') children[1].remove();
        if (mutation === 'duplicate')
          container.append(children[1].cloneNode(true));
        if (mutation === 'reordered')
          container.insertBefore(children[3], children[1]);
        if (mutation === 'occurrence')
          container.insertBefore(children[2], children[1]);
        if (mutation === 'variant')
          children[0].setAttribute('data-marketing-variant', 'centered-phone');
        if (mutation === 'unregistered') {
          const extra = document.createElement('section');
          extra.textContent = 'Unregistered production section';
          container.append(extra);
        }
        if (mutation === 'hidden')
          (children[1] as HTMLElement).style.display = 'none';
        if (mutation === 'prefix')
          children[0].setAttribute('data-testid', 'hero');
        if (mutation === 'unresolved') {
          children[0].setAttribute('data-testid', 'marketing-section-cta');
          children[0].setAttribute(
            'data-marketing-variant',
            'final-single-claim'
          );
        }
      }, item.mutation);
      if (item.code) {
        // Inject the unresolved state deterministically: CTA ownership may be
        // repaired in production without erasing this negative regression.
        const resolveSection: typeof getMarketingSectionRegistryEntry = id => {
          const registered = getMarketingSectionRegistryEntry(id);
          return item.mutation === 'unresolved' && id === 'cta' && registered
            ? { ...registered, sourceBacked: false, resolvedSource: null }
            : registered;
        };
        await expect(
          assertMountedSections(
            page,
            '/gate-fixture',
            expected,
            [],
            resolveSection
          )
        ).rejects.toThrow(`[${item.code}]`);
      } else {
        await assertMountedSections(page, '/gate-fixture', expected);
      }
    });
  }
});

// The declared fallback passes through the same production census. Its nested
// content is excluded only after identity, runtime condition and hiding prove it.
test.describe('marketing declared runtime fallback coverage', () => {
  const expected: readonly MountedSection[] = [
    {
      sectionId: 'hero',
      variantId: 'centered-none',
      componentPath: 'fixture-owner',
    },
  ];
  const fallback: RuntimeFallback = {
    selector: '[data-marketing-runtime-state="no-script-fallback"]',
    componentPath: 'apps/web/components/homepage/HomepageNoScriptContent.tsx',
    hiddenWhen: 'scripting-enabled',
  };
  const cases = [
    {
      name: 'declared hidden fallback and subtree',
      mutation: 'none',
      code: null,
    },
    {
      name: 'missing declared fallback',
      mutation: 'missing',
      code: 'runtime-fallback-count',
    },
    {
      name: 'duplicate declared fallback',
      mutation: 'duplicate',
      code: 'runtime-fallback-count',
    },
    {
      name: 'visible declared fallback',
      mutation: 'visible',
      code: 'runtime-fallback-visible',
    },
    {
      name: 'wrong fallback owner',
      mutation: 'owner',
      code: 'runtime-fallback-owner',
    },
  ] as const;
  for (const item of cases) {
    test(item.name, async ({ page }) => {
      await page.setContent(`
        <style>
          @media (scripting: enabled) {
            [data-marketing-runtime-state="no-script-fallback"] { display: none; }
          }
        </style>
        <main><div>
          <section data-testid="marketing-section-hero" data-marketing-owner="fixture-owner"
            data-marketing-variant="centered-none" style="min-height:32px">Hero content</section>
          <section data-marketing-runtime-state="no-script-fallback"
            data-marketing-owner="${fallback.componentPath}">
            Fallback content<section>Nested fallback content</section>
          </section>
        </div></main>
      `);
      await page.locator(fallback.selector).evaluate((element, mutation) => {
        if (mutation === 'missing') element.remove();
        if (mutation === 'duplicate') element.after(element.cloneNode(true));
        if (mutation === 'visible')
          (element as HTMLElement).style.setProperty(
            'display',
            'block',
            'important'
          );
        if (mutation === 'owner')
          element.setAttribute('data-marketing-owner', 'wrong-owner');
      }, item.mutation);
      if (item.code) {
        await expect(
          assertMountedSections(page, '/gate-fallback-fixture', expected, [
            fallback,
          ])
        ).rejects.toThrow(`[${item.code}]`);
      } else {
        await assertMountedSections(page, '/gate-fallback-fixture', expected, [
          fallback,
        ]);
      }
    });
  }
});
