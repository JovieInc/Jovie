// Homepage page contract (Tim, 2026-11-03: "Jovie helps you move your music
// forward." on `/`; invite-only, the story ends in the role waitlist form).
// One table-driven contract: it renders the real `/` page module and checks
// the route manifest, copy truth sources, the one primary action, product
// imagery, and tokenized styles. Changing the page means changing its typed
// records, not rewriting a dozen source-string guards.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing';
import { getMarketingRecipe } from '@/data/marketing/recipes';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
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
vi.mock('@/lib/content-records/store.server', async () => {
  const { MARKETING_PAGE_KIND } = await import(
    '@/lib/content-records/marketing-page'
  );
  return {
    getLiveContent: async () => ({
      data: MARKETING_PAGE_KIND.defaultRecord('home'),
      source: 'default',
      versionId: null,
      version: null,
      publishedAt: null,
    }),
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
  return render(await HomePage());
}

async function loadCopy() {
  return import('@/data/homepageEditorialCopy');
}

const HOMEPAGE_SOURCES = [
  'data/homepageEditorialCopy.ts',
  'components/homepage/HomepageEditorial.tsx',
  'components/homepage/HomepageSpecSections.tsx',
] as const;

const HOMEPAGE_STYLES = [
  'components/homepage/v3/stage.css',
  'components/homepage/v3/product-ui.css',
  'components/homepage/v3/surfaces.css',
  'components/homepage/v3/phone.css',
  'components/homepage/v3/chapters.css',
  'components/homepage/v3/specs.css',
  'components/homepage/v3/form.css',
  'components/homepage/v3/responsive.css',
  'components/homepage/v3/cinema.css',
] as const;

const PRICE_TEXT = /\$\s?\d|\d+\s?\/\s?mo\b|\bper month\b|\b\d+-day\b/i;

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

  it('renders one h1, the locked line, and one h2 per chapter', async () => {
    const { HOMEPAGE_EDITORIAL_COPY: copy } = await loadCopy();
    const { HOMEPAGE_SPECS_COPY: specs } = await import(
      '@/data/homepageProductUi'
    );
    await renderHomePage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Move your music forward.');
    expect(copy.hero.headline).toBe('Move your music forward.');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    ).toEqual([
      copy.profile.headline,
      copy.releases.headline,
      specs.headline,
      copy.invite.headline,
    ]);
  });

  it.each([true, false])(
    'ends in the one role waitlist form and links nowhere near signup, waitlist=%s',
    async waitlist => {
      gate.WAITLIST_ENABLED = waitlist;
      const { HOMEPAGE_EDITORIAL_COPY: copy, HOMEPAGE_INVITE_ANCHOR } =
        await loadCopy();
      const { container } = await renderHomePage();

      // One conversion: the role waitlist form inside the closing section.
      const forms = [...container.querySelectorAll('form')];
      expect(forms).toHaveLength(1);
      expect(forms[0]).toHaveAttribute('data-testid', 'waitlist-role-form');
      const close = container.querySelector(`#${HOMEPAGE_INVITE_ANCHOR}`);
      expect(close).toHaveAttribute('data-testid', 'marketing-section-cta');
      expect(close?.contains(forms[0] ?? null)).toBe(true);
      expect(within(forms[0]!).getAllByRole('radio')).toHaveLength(6);

      // The hero's primary action scrolls to that form; no public signup.
      const primary = screen.getByTestId('homepage-primary-cta');
      expect(primary).toHaveAttribute('href', `#${HOMEPAGE_INVITE_ANCHOR}`);
      expect(primary).toHaveTextContent(copy.hero.primaryAction);
      expect(
        container.querySelectorAll('[data-primary-action="true"]')
      ).toHaveLength(1);
      const hrefs = [...container.querySelectorAll('a[href]')].map(
        link => link.getAttribute('href') ?? ''
      );
      expect(
        hrefs.filter(href => /^\/(signup|sign-up|start|claim)\b/.test(href))
      ).toEqual([]);
    }
  );

  it('binds performance readiness to the rendered hero and its action', async () => {
    const { container } = await renderHomePage();
    const selectors = getEndUserPerfRouteById('home')?.readySelectors.content;
    expect(selectors?.length).toBeGreaterThan(0);
    for (const selector of selectors ?? []) {
      expect(container.querySelector(selector), selector).not.toBeNull();
    }
  });

  it('shows no prices on the page', async () => {
    const { container } = await renderHomePage();
    const main = [...container.querySelectorAll('section')]
      .map(section => section.textContent ?? '')
      .join(' ');
    expect(main).not.toMatch(PRICE_TEXT);
    for (const path of HOMEPAGE_SOURCES) {
      expect(read(path), path).not.toMatch(PRICE_TEXT);
    }
  });

  it('shows no real person: only the featured demo artist inside the product UI', async () => {
    const { HOMEPAGE_EDITORIAL_COPY: copy } = await loadCopy();
    const { HOMEPAGE_FEATURED_ARTIST: artist } = await import(
      '@/data/demoArtists'
    );
    const { container } = await renderHomePage();
    const sources = [...container.querySelectorAll('section img')].map(image =>
      (image.getAttribute('src') ?? '').replace(/\?v=\w+$/, '')
    );
    // Tim, 2026-11-08: the homepage does not feature him. The live product UI
    // shows an invented demo artist (procedural art, no people) until real
    // artists opt in to be featured. No real person renders on `/`.
    const allowed = [
      artist.avatarSrc,
      ...artist.releases.map(release => release.src),
    ];
    expect(artist.demo).toBe(true);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter(src => !allowed.includes(src))).toEqual([]);
    expect([...new Set(sources)].sort()).toEqual([...new Set(allowed)].sort());
    expect(sources.some(src => /tim-white|img\/releases\//.test(src))).toBe(
      false
    );
    expect(container.textContent).not.toContain('Tim White');
    expect(copy.profile.alt).toBeTruthy();
  });

  it('keeps copy in data and free of em dashes and stock promotion', async () => {
    const { HOMEPAGE_EDITORIAL_COPY } = await loadCopy();
    const lines = JSON.stringify(HOMEPAGE_EDITORIAL_COPY);
    expect(lines).not.toContain('—');
    expect(lines).not.toMatch(
      /\b(seamless|unlock|elevate|world-class|all-in-one|supercharge)\b/i
    );
    const component = read('components/homepage/HomepageEditorial.tsx');
    // Rendered text comes from props/copy, not JSX literals.
    expect(component).not.toMatch(/>\s*[A-Z][a-z]+(?: [a-z]+){2,}[.!]?\s*</);
  });

  it('reconciles homepage fragment anchors with the ids the page renders', async () => {
    const { container } = await renderHomePage();
    const renderedIds = new Set(
      [...container.querySelectorAll('[id]')].map(element => element.id)
    );

    // Every `/#fragment` href in app/components navigates to the homepage
    // root with an anchor, so the fragment must name an id the homepage
    // actually renders. A renamed target (e.g. the old claim input)
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

  it('moves the cinema layer by transform and opacity only, behind reduced motion', () => {
    const css = read('components/homepage/v3/cinema.css').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
    // Scroll-driven only, and only where the user has not asked for less motion.
    expect(css).toMatch(
      /@supports \(animation-timeline: view\(\)\)\s*\{\s*@media \(prefers-reduced-motion: no-preference\)/
    );
    expect(css).not.toMatch(/addEventListener|position:\s*(?:fixed|sticky)/);
    // view() binds to the nearest scroll container, so the hero and chapters
    // clip without becoming one (overflow: hidden would idle every timeline).
    expect(css).toMatch(
      /@supports \(animation-timeline: view\(\)\)\s*\{\s*\.hv3-hero,\s*\.hv3-chapter\s*\{\s*overflow: clip;\s*\}/
    );
    // The horizon line paints above the chapter rule's hairline, which would
    // otherwise cover it; the glow stays behind the copy.
    expect(css).toMatch(
      /\.hv3-chapter::after\s*\{[^}]*z-index:\s*1;[^}]*height:\s*1px;/
    );
    expect(css).toMatch(/\.hv3-chapter::before\s*\{[^}]*z-index:\s*-1;/);
    // Keyframes touch only compositor properties, and never fade to nothing.
    for (const [, body] of css.matchAll(
      /@keyframes [\w-]+\s*\{([\s\S]*?\})\s*\}/g
    )) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(
        ([, prop]) => prop
      );
      expect(new Set(props)).toEqual(new Set(['opacity', 'transform']));
      expect(body).not.toMatch(/opacity:\s*0(?:\.0+)?\s*;/);
    }
  });

  it('holds the premium bar: one grid, exact radii, no rings around the form', async () => {
    const strip = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '');
    const cinema = strip('components/homepage/v3/cinema.css');
    // Frame guides on both content edges, drawn as hard stops on the box.
    expect(cinema).toMatch(
      /\.hv3-hero,\s*\.hv3-chapter\s*\{\s*background-image: linear-gradient\([^;]*var\(--hv3-side\)[^;]*calc\(100% - var\(--hv3-side\)\)/
    );
    // A registration cross where each chapter rule meets a guide.
    expect(cinema).toMatch(
      /\.hv3-chapter > \.hv3-rule::before,\s*\.hv3-chapter > \.hv3-rule::after/
    );
    // The chapter clips its overflow, so the cross is kept inside its box.
    expect(cinema).toMatch(
      /\.hv3-chapter\s*\{\s*padding-top: calc\(var\(--hv3-mark-size\) \/ 2\);/
    );
    // The ion light stays on the rule it lights.
    expect(cinema).toMatch(
      /\.hv3-chapter::before,\s*\.hv3-chapter::after\s*\{\s*top: calc\(var\(--hv3-mark-size\) \/ 2\);/
    );
    // Clipped headline ink has room for ascenders and descenders.
    expect(cinema).toMatch(
      /background-clip: text;[^}]*padding-block: 0\.12em;\s*margin-block: -0\.12em;/
    );
    // The camera yaws then pitches with no roll, so stage rows stay level.
    expect(strip('components/homepage/v3/stage.css')).toMatch(
      /--hv3-cam: rotateY\(-?[\d.]+deg\) rotateX\(-?[\d.]+deg\);/
    );
    // Controls are exact, never pills.
    for (const path of [
      'components/homepage/v3/chapters.css',
      'components/homepage/v3/form.css',
    ]) {
      const css = strip(path);
      for (const block of css.match(
        /\.hv3-btn\s*\{[^}]*\}|waitlist-chip\s*\{[^}]*\}|inline-subscribe"\][^{]*\{[^}]*\}/g
      ) ?? []) {
        expect(block, path).not.toMatch(/radius-pill/);
      }
    }
    // The invitation has no ring around its form.
    const { container } = await renderHomePage();
    expect(container.querySelector('.hv3-invite .hv3-orbit')).toBeNull();
  });
});
