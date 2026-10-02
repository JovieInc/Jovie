import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getAlternative, getAlternativeSlugs } from '@/content/alternatives';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

import AlternativesPage, {
  generateMetadata,
  generateStaticParams,
} from './page';

async function renderSlug(slug: string) {
  const jsx = await AlternativesPage({ params: Promise.resolve({ slug }) });
  return render(jsx);
}

describe('AlternativesPage', () => {
  it('renders the unique, low-opacity dark-underlay hero image for each checked-in slug', async () => {
    for (const slug of ['linktree', 'link-in-bio']) {
      const data = getAlternative(slug);
      if (!data)
        throw new Error(`Missing canonical ${slug} alternative fixture`);

      const { unmount } = await renderSlug(slug);

      expect(
        screen.getByRole('heading', { level: 1, name: data.heroHeadline })
      ).toBeInTheDocument();
      expect(
        screen.getByAltText(data.heroImage.alt).getAttribute('src')
      ).toContain(encodeURIComponent(data.heroImage.src));
      for (const reason of data.whySwitch) {
        expect(screen.getByText(reason.text)).toBeInTheDocument();
      }
      for (const highlight of data.highlights) {
        expect(screen.getByText(highlight.description)).toBeInTheDocument();
      }
      expect(
        screen.getByRole('link', { name: 'Claim my free profile' })
      ).toHaveAttribute('href', '/signup?plan=free');

      unmount();
    }
  });

  it('never repeats a hero image between the two checked-in alternatives', () => {
    const linktree = getAlternative('linktree');
    const linkInBio = getAlternative('link-in-bio');
    if (!linktree || !linkInBio) {
      throw new Error('Missing canonical alternatives fixtures');
    }

    expect(linktree.heroImage.src).not.toBe(linkInBio.heroImage.src);
  });

  it('keeps static params and canonical metadata aligned with the inventory', async () => {
    expect(await generateStaticParams()).toEqual(
      getAlternativeSlugs().map(slug => ({ slug }))
    );
    for (const slug of getAlternativeSlugs()) {
      const data = getAlternative(slug);
      if (!data) throw new Error(`Missing alternative fixture ${slug}`);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(metadata.title).toBe(data.title);
      expect(metadata.alternates?.canonical).toBe(
        `https://jov.ie/alternatives/${slug}`
      );
    }
  });
});
