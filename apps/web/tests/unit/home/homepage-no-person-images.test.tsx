import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Tim (2026-10-26): "keep my face off the homepage. Product page is fine."
 * Renders the real `/` page module and fails if any image on it is a person
 * from the approved-people registry (or a Tim capture). The registry's
 * per-route allowlist never lists `/`; people.mjs enforces that half.
 */
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
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
}));

const registry = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../../scripts/invariants/art-direction/approved-people.json'
    ),
    'utf8'
  )
) as { images: { path: string; routes: string[] }[] };

describe('homepage shows no real person', () => {
  it('lists / on no approved-people image', () => {
    for (const image of registry.images) {
      expect(image.routes, image.path).not.toContain('/');
    }
  });

  it('renders no registered person image or Tim capture', async () => {
    const { default: HomePage } = await import('@/app/(home)/page');
    const { container } = render(await HomePage());
    const sources = [...container.querySelectorAll('img, source')].flatMap(
      node => [node.getAttribute('src'), node.getAttribute('srcset')]
    );
    const html = `${sources.join(' ')} ${container.innerHTML}`;
    const basenames = registry.images.map(image =>
      decodeURIComponent(image.path.slice(image.path.lastIndexOf('/') + 1))
    );
    for (const name of basenames) {
      expect(html, name).not.toContain(name);
    }
    expect(html).not.toMatch(/tim-white|tim-profile/iu);
  });
});
