import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Pitch Deck',
  robots: NOINDEX_ROBOTS,
};

const DECK_SRC = '/pitch/index.html';

/**
 * Public NOINDEX pitch deck. Embeds the canonical HTML deck from
 * apps/web/public/pitch/ as a same-origin iframe. The deck owns its own
 * <html>/<head>/<body>, custom fonts (Manrope/DM Sans/JetBrains Mono),
 * keyboard nav, and native browser print → PDF.
 *
 * The MarketingHeader chrome stays visible above the iframe per the
 * design decision in JOV-2357. To present the deck full-screen, open
 * /pitch/index.html directly (it loads at 16:9 letterboxed by deck-stage.js).
 */
export default function PitchPage() {
  return (
    <main className='flex flex-col bg-base text-primary-token'>
      <h1 className='sr-only'>Jovie Pitch Deck</h1>
      <iframe
        src={DECK_SRC}
        title='Jovie Pitch Deck'
        className='block h-[calc(100svh-var(--marketing-header-height,72px))] w-full border-0'
        allow='fullscreen'
        loading='eager'
      />
    </main>
  );
}
