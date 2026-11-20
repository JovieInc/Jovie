import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Approved people only (today: Tim White, his own photos). Renders the real
 * `/` page module and fails if any person image on it is not an approved
 * person registered for `/`. An unapproved person, or an unregistered image
 * of an approved one, stays off the page. people.mjs enforces the registry.
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
  people: { id: string }[];
  images: { path: string; routes: string[]; person: string }[];
};

const nameOf = (path: string) =>
  decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));

describe('homepage people are approved people only', () => {
  it('registers every person image on / to an approved person', () => {
    const approved = new Set(registry.people.map(person => person.id));
    for (const image of registry.images.filter(i => i.routes.includes('/'))) {
      expect(approved.has(image.person), image.path).toBe(true);
    }
  });

  it('renders no person image that is not registered for /', async () => {
    const { default: HomePage } = await import('@/app/(home)/page');
    const { container } = render(await HomePage());
    const sources = [...container.querySelectorAll('img, source')].flatMap(
      node => [node.getAttribute('src'), node.getAttribute('srcset')]
    );
    const html = `${sources.join(' ')} ${container.innerHTML}`;
    // Registered for another route only: must not appear here.
    for (const image of registry.images.filter(i => !i.routes.includes('/'))) {
      expect(html, image.path).not.toContain(nameOf(image.path));
    }
    // Anything Tim-named that renders must be a registered `/` image.
    let rest = html;
    for (const image of registry.images.filter(i => i.routes.includes('/'))) {
      rest = rest.split(nameOf(image.path)).join('');
    }
    expect(rest).not.toMatch(/tim-white|tim-profile/iu);
  });
});
