import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Pitch Deck',
  robots: NOINDEX_ROBOTS,
};

const DECK_SRC = '/pitch/index.html';
const PDF_HREF = '/Jovie-Pitch-Deck.pdf';
const PDF_FILENAME = 'Jovie-Pitch-Deck.pdf';

/**
 * Public NOINDEX pitch deck. Embeds the canonical HTML deck from
 * apps/web/public/pitch/ as a same-origin iframe. The deck owns its own
 * <html>/<head>/<body>, custom fonts (Manrope/DM Sans/JetBrains Mono),
 * keyboard nav, slide dots, fullscreen, and @media print → PDF.
 *
 * Adds a one-click "Download PDF" button (floating control) that serves the
 * pre-generated static PDF at /Jovie-Pitch-Deck.pdf (regenerated once via
 * Playwright from the canonical deck source). This is preferred over raw
 * print() per the original JOV-9010 / JOV-2357 scope.
 *
 * The MarketingHeader chrome stays visible above the iframe per the
 * design decision in JOV-2357. To present the deck full-screen, open
 * /pitch/index.html directly (it loads at 16:9 letterboxed by deck-stage.js).
 */
export default function PitchPage() {
  return (
    <main className='flex flex-col bg-base text-primary-token'>
      <h1 className='sr-only'>Jovie Pitch Deck</h1>
      <div className='relative w-full overflow-visible h-[calc(100svh-var(--marketing-header-height,72px))] shadow-[0_0_0_1px_rgba(255,255,255,0.015),0_0_110px_-15px_rgba(77,125,255,0.065),0_0_180px_-25px_rgba(124,58,237,0.055)]'>
        {/* PDF download control (replaces print() affordance; smallest addition to hero deck) */}
        <a
          href={PDF_HREF}
          download={PDF_FILENAME}
          className='absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/45 px-2.5 py-1 text-[10px] font-medium tracking-[0.02em] text-white/70 backdrop-blur-md transition-colors duration-subtle hover:border-white/20 hover:bg-black/65 hover:text-white/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40'
          aria-label='Download Jovie Pitch Deck as PDF'
          title='Download PDF'
        >
          PDF
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='11'
            height='11'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='3'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='ml-px -mt-px opacity-85'
            aria-hidden='true'
          >
            <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
            <polyline points='7 10 12 15 17 10' />
            <line x1='12' y1='15' x2='12' y2='3' />
          </svg>
        </a>
        <iframe
          src={DECK_SRC}
          title='Jovie Pitch Deck'
          className='block h-full w-full border-0'
          allow='fullscreen'
          loading='eager'
        />
      </div>
    </main>
  );
}
