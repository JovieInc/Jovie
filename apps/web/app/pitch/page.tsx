import { Download, Mail, Maximize2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/atoms/Logo';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie Pitch Deck',
  robots: NOINDEX_ROBOTS,
};

const DECK_SRC = '/pitch/index.html';
const PDF_HREF = '/Jovie-Pitch-Deck.pdf';
const PDF_FILENAME = 'Jovie-Pitch-Deck.pdf';
const CONTACT_EMAIL = 't@meetjovie.com';

const CHROME_LINK_CLASS =
  'group inline-flex items-center gap-1.5 -mx-2 -my-1 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.04em] text-white/45 transition-colors duration-subtle hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded';

export default function PitchPage() {
  return (
    <>
      <h1 className='sr-only'>Jovie Pitch Deck</h1>

      {/* Desktop / tablet: full-bleed deck stage */}
      <div className='hidden h-svh w-full flex-col bg-black sm:flex'>
        <header className='flex h-11 shrink-0 items-center justify-between border-b border-white/[0.04] px-5'>
          <Link
            href='/'
            className='inline-flex items-center opacity-80 transition-opacity duration-subtle hover:opacity-100'
            aria-label='Jovie home'
          >
            <Logo variant='word' tone='white' size='xs' />
          </Link>
          <nav className='flex items-center gap-5'>
            <a
              href={DECK_SRC}
              target='_blank'
              rel='noreferrer'
              className={CHROME_LINK_CLASS}
              aria-label='Open deck in new tab for fullscreen presentation'
            >
              <Maximize2
                className='size-3 opacity-80 group-hover:opacity-100'
                aria-hidden='true'
              />
              <span>Present</span>
            </a>
            <a
              href={PDF_HREF}
              download={PDF_FILENAME}
              className={CHROME_LINK_CLASS}
              aria-label='Download pitch deck as PDF'
            >
              <Download
                className='size-3 opacity-80 group-hover:opacity-100'
                aria-hidden='true'
              />
              <span>PDF</span>
            </a>
          </nav>
        </header>

        <div className='relative min-h-0 flex-1'>
          <iframe
            src={DECK_SRC}
            title='Jovie Pitch Deck'
            className='block h-full w-full border-0'
            allow='fullscreen'
            loading='eager'
          />
          <p
            aria-hidden='true'
            className='pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] tracking-[0.08em] text-white/15'
          >
            Jovie · Seed · 2026
          </p>
        </div>
      </div>

      {/* Mobile: minimal fallback */}
      <div className='flex min-h-svh w-full flex-col items-center justify-center gap-10 bg-black px-6 py-16 sm:hidden'>
        <Logo variant='word' tone='white' size='sm' />
        <div className='flex flex-col items-center gap-3 text-center'>
          <p className='font-mono text-[10px] uppercase tracking-[0.18em] text-white/35'>
            Pitch Deck
          </p>
          <p className='max-w-[18rem] text-balance text-base leading-snug text-white/70'>
            Designed for desktop. Open on a larger screen or download the PDF.
          </p>
        </div>
        <div className='flex flex-col items-stretch gap-3'>
          <a
            href={PDF_HREF}
            download={PDF_FILENAME}
            className='inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white transition-colors duration-subtle hover:border-white/40 hover:bg-white/[0.04]'
          >
            <Download className='size-4' aria-hidden='true' />
            Download PDF
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className='inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white/60 transition-colors duration-subtle hover:text-white'
          >
            <Mail className='size-4' aria-hidden='true' />
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </>
  );
}
