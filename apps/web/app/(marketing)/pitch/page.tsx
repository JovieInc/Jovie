import type { Metadata } from 'next';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';
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
  const manifest = await getInvestorManifest();
  const slides = await Promise.all(
    manifest.deck.slides.map(async filename => {
      try {
        const doc = await getMarkdownDocument(
          `investors/deck/slides/${filename}`
        );
        const h1 = doc.toc.find(entry => entry.level === 1);
        const title =
          h1?.title ?? filename.replace(/^\d+-/, '').replace(/\.md$/, '');
        const html = doc.html.replace(/<h1[^>]*>.*?<\/h1>/i, '');
        return { title, html };
      } catch {
        return null;
      }
    })
  );
  const validSlides = slides.filter(
    (s): s is { title: string; html: string } => s !== null
  );
  const pdfUrl = `/${manifest.deck.downloadFilename}`;

  return (
    <main className='bg-base px-4 py-12 text-primary-token sm:px-6 sm:py-16 lg:py-20'>
      <h1 className='sr-only'>Jovie Pitch Deck</h1>
      <div className='mx-auto w-full max-w-4xl'>
        <DeckViewer slides={validSlides} pdfUrl={pdfUrl} />
      </div>
    </main>
  );
}
