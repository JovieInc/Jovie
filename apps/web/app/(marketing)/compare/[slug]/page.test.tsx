import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getComparison, getComparisonSlugs } from '@/content/comparisons';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

import ComparePage, { generateMetadata, generateStaticParams } from './page';

describe('ComparePage', () => {
  it('statically renders every checked-in comparison with corrected claims', async () => {
    for (const slug of getComparisonSlugs()) {
      const data = getComparison(slug);
      if (!data) throw new Error(`Missing comparison fixture ${slug}`);

      const jsx = await ComparePage({ params: Promise.resolve({ slug }) });
      const { unmount } = render(jsx);

      expect(
        screen.getByRole('heading', { level: 1, name: data.heroHeadline })
      ).toBeInTheDocument();
      expect(screen.getByText(data.bottomLine)).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(data.features.length + 1);
      expect(
        screen.getByRole('link', { name: 'Claim my free profile' })
      ).toHaveAttribute('href', '/signup?plan=free');

      unmount();
    }
  });

  it('keeps static params and canonical metadata aligned with the inventory', async () => {
    expect(await generateStaticParams()).toEqual(
      getComparisonSlugs().map(slug => ({ slug }))
    );

    for (const slug of getComparisonSlugs()) {
      const data = getComparison(slug);
      if (!data) throw new Error(`Missing comparison fixture ${slug}`);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(metadata.title).toBe(data.title);
      expect(metadata.alternates?.canonical).toBe(
        `https://jov.ie/compare/${slug}`
      );
    }
  });
});
