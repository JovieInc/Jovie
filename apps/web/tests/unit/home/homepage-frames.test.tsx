// Homepage frame contract (prod walk, 2026-11-09): every label, keycap and
// edge on `/` stays inside the frame it belongs to. It renders the real `/`
// page module, like the homepage contract, and reads the v3 stylesheets.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('homepage frames', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('keeps every label, keycap and edge inside its frame', async () => {
    const strip = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, '');
    const { container } = await renderHomePage();
    // 02: the catalog sits on the left frame guide, so a label to its left
    // would leave the page; the connector alone ties the row to its page.
    const releases = container.querySelector('.hv3-releases');
    expect(releases).not.toBeNull();
    expect(releases?.querySelector('[data-hv3-callout]')).toBeNull();
    expect(
      releases?.querySelector('[data-hv3-connector="rowR>title"]')
    ).not.toBeNull();
    const stage = strip('components/homepage/v3/stage.css');
    expect(stage).toMatch(
      /\.hv3-phone--release \.hv3-anchor--before\s*\{\s*left: -0\.75rem;/
    );
    // 03: the keycaps sit above the palette, and the palette is inset evenly.
    const surfaces = strip('components/homepage/v3/surfaces.css');
    expect(surfaces).toMatch(
      /\.hv3-palette\s*\{[^}]*top: 8rem;\s*right: 3rem;\s*left: 3rem;/
    );
    expect(surfaces).toMatch(
      /\.hv3-keys\s*\{[^}]*top: 1\.5rem;\s*right: 3rem;/
    );
    expect(surfaces).not.toMatch(/\.hv3-keys\s*\{[^}]*bottom:/);
    expect(strip('components/homepage/v3/responsive.css')).not.toMatch(
      /\.hv3-keys\s*\{[^}]*bottom:/
    );
    // US spelling throughout.
    expect(container.textContent).not.toMatch(/recognis/i);
    // 04: the email field spans the role chips; the scrolled nav is opaque.
    const form = strip('components/homepage/v3/form.css');
    expect(form).toMatch(
      /@media \(min-width: 48rem\)\s*\{\s*\.hv3-form > div\s*\{\s*width: fit-content;\s*max-width: 100%;\s*\}\s*\.hv3-form \[data-slot="inline-subscribe"\]\s*\{\s*width: 100%;/
    );
    expect(form).toMatch(
      /\.home-viewport \.header-nav--docked\s*\{\s*--marketing-dock-glass: var\(--noir-ion-shell\);/
    );
  });
});
