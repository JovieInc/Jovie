// Homepage page contract (EVENT 2026-10-20, Tim: the homepage sells the
// artist profile). One table-driven contract replaces the per-component
// homepage locks: it renders the real `/` page module and checks the route
// manifest, copy truth sources, the one primary action, product imagery, and
// tokenized styles. Changing the page means changing its typed records, not
// rewriting a dozen source-string guards.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing';
import { getMarketingRecipe } from '@/data/marketing/recipes';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import { PRICING_COMPARISON } from '@/lib/entitlements/registry';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { getEndUserPerfRouteById } from '@/scripts/performance-route-manifest';

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: true }));
vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: new Proxy(actual.FEATURE_FLAGS, {
      get: (target, key) =>
        key === 'WAITLIST_ENABLED'
          ? gate.WAITLIST_ENABLED
          : target[key as keyof typeof target],
    }),
  };
});
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

async function renderHomePage() {
  const { default: HomePage } = await import('@/app/(home)/page');
  return render(HomePage());
}

async function loadCopy() {
  const [{ HOMEPAGE_COPY }, { HOMEPAGE_FAN_STATES_COPY }] = await Promise.all([
    import('@/data/homepageCopy'),
    import('@/data/homepageFanStatesCopy'),
  ]);
  return { HOMEPAGE_COPY, HOMEPAGE_FAN_STATES_COPY };
}

const HOMEPAGE_SOURCES = [
  'data/homepageCopy.ts',
  'data/homepageFanStatesCopy.ts',
  'components/homepage/HomepageArtistProfile.tsx',
  'components/marketing/MarketingOfferSummary.tsx',
  'components/marketing/MarketingPhoneStateGallery.tsx',
] as const;

const HOMEPAGE_STYLES = [
  'components/homepage/HomepageArtistProfile.css',
  'components/marketing/MarketingProductStates.css',
] as const;

describe('homepage contract', { timeout: 60_000 }, () => {
  beforeEach(() => {
    gate.WAITLIST_ENABLED = true;
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('mounts exactly the manifest sections, in recipe order', async () => {
    const { container } = await renderHomePage();
    const entry = MARKETING_ROUTE_MANIFEST.find(
      route => route.glob === '(home)/page.tsx'
    );
    const recipe = getMarketingRecipe('homepage');

    const mounted = [
      ...container.querySelectorAll('[data-testid^="marketing-section-"]'),
    ].map(section => ({
      sectionId: section
        .getAttribute('data-testid')
        ?.replace('marketing-section-', ''),
      variantId: section.getAttribute('data-marketing-variant'),
      owner: section.getAttribute('data-marketing-owner'),
    }));

    expect(mounted.map(section => section.sectionId)).toEqual(
      recipe?.sectionOrder
    );
    const bindings = (entry?.renderedSections ?? []).filter(
      binding => binding.kind === 'approved-section'
    );
    expect(mounted).toEqual(
      bindings.map(binding => ({
        sectionId: binding.sectionId,
        variantId: binding.variantId ?? null,
        owner: binding.componentPath,
      }))
    );
  });

  it('renders one h1 from the copy module and no stray headings', async () => {
    const { HOMEPAGE_COPY, HOMEPAGE_FAN_STATES_COPY } = await loadCopy();
    await renderHomePage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(HOMEPAGE_COPY.hero.headline);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    ).toEqual([
      HOMEPAGE_FAN_STATES_COPY.headline,
      HOMEPAGE_COPY.offer.headline,
    ]);
  });

  it.each([true, false])(
    'keeps one primary action, the jov.ie/ claim into /start, with waitlist=%s',
    async waitlist => {
      gate.WAITLIST_ENABLED = waitlist;
      const { HOMEPAGE_COPY } = await loadCopy();
      const { MARKETING_CTA_INTENTS } = await import(
        '@/data/marketingCtaIntents'
      );
      const { container } = await renderHomePage();

      const forms = [...container.querySelectorAll('form')];
      expect(forms).toHaveLength(2); // hero + terminal CTA, same action
      for (const form of forms) {
        expect(form).toHaveAttribute('action', '/start');
        expect(
          within(form).getByRole('button', {
            name: HOMEPAGE_COPY.hero.claim.action,
          })
        ).toHaveAttribute('type', 'submit');
      }
      expect(screen.queryByText('Request access')).toBeNull();
      expect(screen.getByText(HOMEPAGE_COPY.hero.supportNote)).toBeVisible();
      expect(HOMEPAGE_COPY.hero.supportNote).toBe(
        MARKETING_CTA_INTENTS.claimProfile.support
      );
    }
  );

  it('binds performance readiness to the rendered hero and claim', async () => {
    const { container } = await renderHomePage();
    const selectors = getEndUserPerfRouteById('home')?.readySelectors.content;
    expect(selectors?.length).toBeGreaterThan(0);
    for (const selector of selectors ?? []) {
      expect(container.querySelector(selector), selector).not.toBeNull();
    }
  });

  it('states prices only through offer truth', async () => {
    const { HOMEPAGE_COPY } = await loadCopy();
    await renderHomePage();
    const summary = screen.getByTestId('homepage-offer-summary');
    const claim = getPublicPriceClaim(HOMEPAGE_COPY.offer.plan);

    expect(summary).toHaveAttribute('data-offer-plan', claim.plan);
    expect(summary).toHaveTextContent(formatPublicPriceDisplay(claim));
    expect(summary).toHaveTextContent(claim.badge);
    // No source file on the page may type a price, plan name, or trial.
    for (const path of HOMEPAGE_SOURCES) {
      expect(read(path), path).not.toMatch(
        /\$\s?\d|\d+\s?\/\s?mo\b|\bper month\b/i
      );
      expect(read(path), path).not.toMatch(/\b\d+-day\b/i);
    }
  });

  it('backs every free inclusion with a free entitlement row', async () => {
    const { HOMEPAGE_COPY } = await loadCopy();
    const features = new Map(
      PRICING_COMPARISON.flatMap(category => category.features).map(feature => [
        feature.name,
        feature,
      ])
    );
    for (const item of HOMEPAGE_COPY.offer.included) {
      const feature = features.get(item.entitlement);
      expect(feature, item.entitlement).toBeDefined();
      expect(feature?.free, item.entitlement).not.toBe(false);
    }
  });

  it('shows real product states from the screenshot registry only', async () => {
    const { HOMEPAGE_COPY, HOMEPAGE_FAN_STATES_COPY } = await loadCopy();
    const { container } = await renderHomePage();
    const scenarios = [
      HOMEPAGE_COPY.hero.profile.scenarioId,
      ...HOMEPAGE_FAN_STATES_COPY.states.map(state => state.scenarioId),
    ];
    const expected = scenarios.map(id => getMarketingExportImage(id).publicUrl);
    const images = [...container.querySelectorAll('main img, section img')];

    expect(images.map(image => image.getAttribute('src'))).toEqual(expected);
    // The hero capture is the LCP image; nothing below the fold is priority.
    expect(
      images.map(image => image.getAttribute('data-priority') === 'true')
    ).toEqual([true, false, false, false]);
    for (const image of images) {
      expect(image.getAttribute('alt')?.length).toBeGreaterThan(20);
    }
    for (const path of HOMEPAGE_SOURCES) {
      expect(read(path), path).not.toContain('/product-screenshots/');
    }
  });

  it('keeps copy in data and free of em dashes and stock promotion', async () => {
    const { HOMEPAGE_COPY, HOMEPAGE_FAN_STATES_COPY } = await loadCopy();
    const lines = JSON.stringify([HOMEPAGE_COPY, HOMEPAGE_FAN_STATES_COPY]);
    expect(lines).not.toContain('—');
    expect(lines).not.toMatch(
      /\b(seamless|unlock|elevate|world-class|all-in-one|supercharge)\b/i
    );
    const component = read('components/homepage/HomepageArtistProfile.tsx');
    // Rendered text comes from props/copy, not JSX literals.
    expect(component).not.toMatch(/>\s*[A-Z][a-z]+(?: [a-z]+){2,}[.!]?\s*</);
  });

  it('keeps the homepage stylesheets on tokens', () => {
    for (const path of HOMEPAGE_STYLES) {
      const css = read(path).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, `${path}: raw hex`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, `${path}: rgb()`).not.toMatch(/\brgba?\(/);
      expect(css, `${path}: cubic-bezier`).not.toMatch(/cubic-bezier\(/);
      expect(css, `${path}: raw ms`).not.toMatch(/\b\d+m?s\b/);
      // Only hairlines and the fallback 0px may be raw px.
      const rawPx = css.match(/\b(?!0px\b|1px\b|2px\b)\d+(?:\.\d+)?px\b/g);
      expect(rawPx, `${path}: raw px`).toBeNull();
      expect(css, `${path}: transition-all`).not.toMatch(/transition:\s*all\b/);
      // DETAILS.md text casing: no all-caps eyebrows or labels (Clef
      // all_caps_text failed live jov.ie on these, 2026-10-20).
      expect(css, `${path}: uppercase`).not.toMatch(
        /text-transform:\s*uppercase/
      );
    }
    for (const path of HOMEPAGE_SOURCES) {
      expect(read(path), `${path}: uppercase`).not.toMatch(/\buppercase\b/);
    }
  });
});
