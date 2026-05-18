import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';

export interface DeckSlide {
  readonly title: string;
  readonly html: string;
}

export interface DeckBundle {
  readonly slides: DeckSlide[];
  readonly pdfUrl: string;
}

/**
 * Load the investor pitch deck — slide HTML + the canonical PDF download URL.
 *
 * Single loader used by both `/investor-portal` (gated) and `/pitch` (public)
 * so they stay in sync. Per-slide failures are swallowed (logged via the
 * markdown loader) so a missing slide file does not 500 the whole deck.
 */
export async function loadDeckBundle(): Promise<DeckBundle> {
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

  return {
    slides: slides.filter((s): s is DeckSlide => s !== null),
    pdfUrl: `/${manifest.deck.downloadFilename}`,
  };
}
