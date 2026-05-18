import type { Metadata } from 'next';
import { loadDeckBundle } from '@/lib/investors/loadDeckSlides';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { DeckViewer } from '../../investor-portal/_components/DeckViewer';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Pitch Deck',
  robots: NOINDEX_ROBOTS,
};

/**
 * Public, NOINDEX'd pitch deck.
 * Reuses the same slide source (content/investors/deck/slides/*.md) and the
 * same DeckViewer as the gated /investor-portal route. Fully static.
 */
export default async function PitchPage() {
  const { slides, pdfUrl } = await loadDeckBundle();

  return (
    <main className='bg-base px-4 py-12 text-primary-token sm:px-6 sm:py-16 lg:py-20'>
      <h1 className='sr-only'>Jovie Pitch Deck</h1>
      <div className='mx-auto w-full max-w-4xl'>
        <DeckViewer slides={slides} pdfUrl={pdfUrl} />
      </div>
    </main>
  );
}
