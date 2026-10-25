// Changelog claim anchor contract (JOV-8798). The changelog terminal CTA is
// the one production `/#fragment` link into the homepage claim form, so it
// must ride native fragment navigation onto an id the homepage actually
// renders. This suite renders both real route modules: it reads the rendered
// changelog CTA href (executing the exact changed page line, which keeps the
// exact-head changed-line coverage ratchet honest) and resolves its fragment
// against the rendered homepage DOM, then applies the same resolution rule to
// every string-literal `/#fragment` anchor in production app/components
// sources so the next claim-input rename cannot silently dead-end dependent
// CTAs again.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  // The changelog page wraps its fs snapshot read in unstable_cache; outside
  // a Next request scope the wrapper is an identity passthrough.
  unstableCache: <T extends (...arguments_: never[]) => Promise<unknown>>(
    load: T
  ) => load,
}));
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

async function renderChangelogPage() {
  const { default: ChangelogPage } = await import(
    '@/app/(marketing)/changelog/page'
  );
  return render(await ChangelogPage());
}

async function renderHomePage() {
  const { default: HomePage } = await import('@/app/(home)/page');
  return render(HomePage());
}

function collectHomepageFragmentAnchors(): Set<string> {
  const anchors = new Set<string>();
  const collect = (directory: string): void => {
    for (const entry of readdirSync(directory, {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') {
          continue;
        }
        collect(path);
      } else if (
        /\.(?:ts|tsx)$/.test(entry.name) &&
        !/(?:\.test\.|\.spec\.|\.stories\.)/.test(entry.name)
      ) {
        for (const match of read(path).matchAll(
          /['"`]\/#([A-Za-z0-9][A-Za-z0-9_-]*)['"`]/g
        )) {
          anchors.add(match[1]);
        }
      }
    }
  };
  collect('app');
  collect('components');
  return anchors;
}

describe('changelog claim anchor', { timeout: 60_000 }, () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it('routes the terminal CTA onto the homepage claim input the hero renders', async () => {
    await renderChangelogPage();
    const cta = screen.getByRole('link', { name: 'Find your profile' });
    expect(cta).toHaveAttribute('href', '/#homepage-claim-handle');

    const href = cta.getAttribute('href') ?? '';
    const fragment = fragmentOf(href);
    // querySelector safety: a fragment is an element id.
    expect(fragment).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    cleanup();

    const home = await renderHomePage();
    const target = home.container.querySelector(`#${fragment}`);
    expect(
      target,
      `homepage renders an element the /#fragment can navigate to: #${fragment}`
    ).not.toBeNull();
    // The fragment must land on the hero claim input (the conversion control
    // the changelog CTA promises), not on an incidental decoration id.
    expect(target).toBeInstanceOf(HTMLInputElement);
    expect(target).toHaveAttribute('name', 'handle');
  });

  it('resolves every production /#fragment anchor against the ids the homepage renders', async () => {
    const anchors = collectHomepageFragmentAnchors();
    expect(
      anchors.size,
      `the fragment-anchor scan found production anchors — it has not gone stale: ${[
        ...anchors,
      ].join(', ')}`
    ).toBeGreaterThan(0);

    const { container } = await renderHomePage();
    const renderedIds = new Set(
      [...container.querySelectorAll('[id]')].map(element => element.id)
    );
    const missing = [...anchors].filter(id => !renderedIds.has(id));
    expect(missing).toEqual([]);
  });
});

function fragmentOf(href: string): string {
  const index = href.indexOf('#');
  expect(
    index,
    `changelog CTA href carries a fragment: ${href}`
  ).toBeGreaterThan(-1);
  return href.slice(index + 1);
}
