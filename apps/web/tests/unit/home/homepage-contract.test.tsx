// Homepage page contract (generic homepage, Tim 2026-10-22 and 2026-10-26:
// locked headline, app shell product shot, claim close; the artist-profile
// story lives on /artist-profiles). One table-driven contract replaces the per-component
// homepage locks: it renders the real `/` page module and checks the route
// manifest, copy truth sources, the one primary action, product imagery, and
// tokenized styles. Changing the page means changing its typed records, not
// rewriting a dozen source-string guards.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing';
import { getMarketingRecipe } from '@/data/marketing/recipes';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { PRICING_COMPARISON } from '@/lib/entitlements/registry';
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
// The async changelog read is covered by HomepageWhatsNew.test.tsx; the page
// contract renders the same section from three fixed entries.
vi.mock('@/components/homepage/shell-hero/HomepageWhatsNew', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/homepage/shell-hero/HomepageWhatsNew')
  >('@/components/homepage/shell-hero/HomepageWhatsNew');
  const entries = ['a', 'b', 'c'].map((id, index) => ({
    id,
    title: `Update ${id}`,
    date: `2026-10-0${index + 1}`,
  }));
  return {
    ...actual,
    HomepageWhatsNew: () =>
      actual.HomepageWhatsNewSection({ entries: entries as never }),
  };
});
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
  const { HOMEPAGE_COPY } = await import('@/data/homepageCopy');
  return { HOMEPAGE_COPY };
}

const HOMEPAGE_SOURCES = [
  'data/homepageCopy.ts',
  'components/homepage/shell-hero/HomepageShellHero.tsx',
  'components/homepage/shell-hero/HomepageClaimClose.tsx',
  'components/homepage/shell-hero/HomepageWhatsNew.tsx',
] as const;

const HOMEPAGE_STYLES = [
  'components/homepage/HomepageArtistProfile.css',
  'components/homepage/HomepageAtmosphere.css',
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

  it('keeps the canvas off until WebGL can run and mounts no hero light', async () => {
    const { container } = await renderHomePage();
    expect(
      container.querySelector('[data-testid="homepage-hero-light"]')
    ).toBeNull();
    expect(container.querySelector('[data-hero-zoom]')).not.toBeNull();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="homepage-matte-section"] canvas')
    ).not.toBeNull();
    // The matte field is below the hero, never under it.
    expect(
      container.querySelector('[data-hero-zoom] canvas'),
      'one moving idea per frame'
    ).toBeNull();
  });

  it('renders one h1 from the copy module and no stray headings', async () => {
    const { HOMEPAGE_COPY } = await loadCopy();
    const { COMPANY_IDENTITY } = await import('@/data/companyIdentity');
    await renderHomePage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(HOMEPAGE_COPY.shell.headline).toBe(
      COMPANY_IDENTITY.homepageHeadline
    );
    expect(h1s[0].textContent?.replaceAll(/\s+/g, ' ').trim()).toBe(
      COMPANY_IDENTITY.homepageHeadline
    );
    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    ).toEqual([
      HOMEPAGE_COPY.shell.whatsNew.heading,
      HOMEPAGE_COPY.shell.claim.heading,
    ]);
  });

  it.each([true, false])(
    'keeps one primary action, the jov.ie/ claim into /start, with waitlist=%s',
    async waitlist => {
      gate.WAITLIST_ENABLED = waitlist;
      const { HOMEPAGE_COPY } = await loadCopy();
      const { container } = await renderHomePage();

      const forms = [...container.querySelectorAll('form')];
      expect(forms).toHaveLength(1); // the claim close; the hero shot is an image
      expect(forms[0]).toHaveAttribute('action', '/start');
      expect(
        within(forms[0]).getByRole('button', {
          name: HOMEPAGE_COPY.shell.claim.action,
        })
      ).toHaveAttribute('type', 'submit');
      expect(screen.queryByText('Request access')).toBeNull();
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

  it('types no price, plan, or trial on the page sources', () => {
    for (const path of HOMEPAGE_SOURCES) {
      expect(read(path), path).not.toMatch(
        /\$\s?\d|\d+\s?\/\s?mo\b|\bper month\b/i
      );
      expect(read(path), path).not.toMatch(/\b\d+-day\b/i);
    }
    expect(getPublicPriceClaim('free').plan).toBe('free');
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

  it('shows the template app shell as the only hero image, with alt text', async () => {
    const { container } = await renderHomePage();
    const images = [...container.querySelectorAll('img')];

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('alt')).toBe(
      'Example: the Jovie app with a claimed jov.ie/you profile'
    );
    expect(images[0].getAttribute('src')).toBe(
      '/assets/marketing/app-shell-template.webp'
    );
    for (const path of HOMEPAGE_SOURCES) {
      expect(read(path), path).not.toContain('/product-screenshots/');
    }
  });

  it('keeps copy in data and free of em dashes and stock promotion', async () => {
    const { HOMEPAGE_COPY } = await loadCopy();
    const lines = JSON.stringify(HOMEPAGE_COPY.shell);
    expect(lines).not.toContain('—');
    expect(lines).not.toMatch(
      /\b(seamless|unlock|elevate|world-class|all-in-one|supercharge)\b/i
    );
    // Rendered text comes from props/copy, not JSX literals.
    for (const path of HOMEPAGE_SOURCES.slice(1)) {
      expect(read(path), path).not.toMatch(
        />\s*[A-Z][a-z]+(?: [a-z]+){2,}[.!]?\s*</
      );
    }
  });

  it('reconciles homepage fragment anchors with the ids the page renders', async () => {
    const { container } = await renderHomePage();
    const renderedIds = new Set(
      [...container.querySelectorAll('[id]')].map(element => element.id)
    );

    // Every `/#fragment` href in app/components navigates to the homepage
    // root with an anchor, so the fragment must name an id the homepage
    // actually renders. A renamed claim input (e.g. the old `handle-input`)
    // otherwise silently dead-ends every dependent CTA at the top of `/`.
    const anchors = new Set<string>();
    const collectAnchors = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') {
            continue;
          }
          collectAnchors(path);
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/(\.test\.|\.spec\.|\.stories\.)/.test(entry.name)
        ) {
          for (const match of read(path).matchAll(
            /['"`]\/#([A-Za-z0-9][A-Za-z0-9_-]*)['"`]/g
          )) {
            anchors.add(match[1]);
          }
        }
      }
    };
    collectAnchors('app');
    collectAnchors('components');

    expect(
      anchors.size,
      `no homepage fragment anchors found — the guard scan went stale: ${[
        ...anchors,
      ].join(', ')}`
    ).toBeGreaterThan(0);
    const missing = [...anchors].filter(id => !renderedIds.has(id));
    expect(missing).toEqual([]);
  });

  it('keeps the homepage JSON-LD on the approved artist-profile copy and canonical billing (JOV-8565)', async () => {
    const { container } = await renderHomePage();
    const { ARTIST_PROFILE_COPY } = await import('@/data/artistProfileCopy');
    const { BASE_URL } = await import('@/constants/app');

    const schemas = [
      ...container.querySelectorAll('script[type="application/ld+json"]'),
    ].map(script => JSON.parse(script.textContent ?? '{}'));
    const website = schemas.find(s => s['@type'] === 'WebSite');
    const software = schemas.find(s => s['@type'] === 'SoftwareApplication');

    // The homepage WebSite schema speaks with the approved artist-profile
    // landing-page copy, verbatim (JOV-8565) — not a hand-rolled line.
    expect(website).toBeDefined();
    expect(website.url).toBe(BASE_URL);
    expect(website.description).toBe(ARTIST_PROFILE_COPY.seo.description);

    // Billing claims come from offer truth: the free-forever profile and the
    // self-serve monthly Pro offer. No hardcoded or stale prices.
    const freeClaim = getPublicPriceClaim('free');
    const proClaim = getPublicPriceClaim('pro');
    const offers = software?.offers;
    expect(Array.isArray(offers)).toBe(true);
    expect(offers).toHaveLength(2);
    expect(offers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          price: String(freeClaim.priceUsd),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        }),
        expect.objectContaining({
          price: String(proClaim.priceUsd),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        }),
      ])
    );

    // No fabricated social proof, and no speculative capability claims: the
    // SearchAction stays off until the route serves search queries.
    expect(software).not.toHaveProperty('aggregateRating');
    expect(website).not.toHaveProperty('potentialAction');
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
