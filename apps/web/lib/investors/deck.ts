import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { getInvestorManifest } from '@/lib/investors/manifest';

export interface InvestorDeckSlide {
  title: string;
  html: string;
}

export async function getInvestorDeck(): Promise<{
  slides: InvestorDeckSlide[];
  pdfUrl: string;
}> {
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
    slides: slides.filter(
      (slide): slide is InvestorDeckSlide => slide !== null
    ),
    pdfUrl: `/${manifest.deck.downloadFilename}`,
  };
}
