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
) as {
  images: { path: string; routes: string[]; homeApproval?: string }[];
};

// Tim approved the canonical v1 design, which shows his own profile photo, on
// 2026-11-07 (receipt home-canonical-v1). Only images carrying that receipt
// may render on `/`; every other registered person stays off it.
const HOME_RECEIPT = 'home-canonical-v1';

describe('homepage shows no real person', () => {
  it('lists / on no approved-people image', () => {
    for (const image of registry.images) {
      if (image.homeApproval === HOME_RECEIPT) continue;
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
    const nameOf = (image: { path: string }) =>
      decodeURIComponent(image.path.slice(image.path.lastIndexOf('/') + 1));
    const approved = registry.images
      .filter(image => image.homeApproval === HOME_RECEIPT)
      .map(nameOf);
    for (const image of registry.images) {
      const name = nameOf(image);
      if (approved.includes(name)) continue;
      expect(html, name).not.toContain(name);
    }
    let rest = html;
    for (const name of approved) rest = rest.split(name).join('');
    expect(rest).not.toMatch(/tim-white|tim-profile/iu);
  });
});
