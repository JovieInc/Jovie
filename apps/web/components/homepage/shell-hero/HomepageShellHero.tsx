// @coverage-via apps/web/components/homepage/shell-hero/HomepageShellHero.test.tsx
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import { HomepageLogoRow } from './HomepageLogoRow';
import { HomepageShellHeroFrame } from './HomepageShellHeroFrame';
import './HomepageShellHero.css';

/** Native size of the shell source image (2x of the 1348x960 Pen frame). */
export const SHELL_IMAGE = Object.freeze({
  width: 2696,
  height: 1920,
  avif: '/assets/marketing/app-shell-template.avif',
  webp: '/assets/marketing/app-shell-template.webp',
});

/**
 * Homepage hero (generic, 2026-10-26). The locked headline, one support
 * line, then the app shell as a matte product shot, then a logo slot that
 * renders nothing until LOGO_PERMISSIONS holds a grant for `/`.
 *
 * At rest this is a plain stack. On wide screens with motion allowed it is
 * pinned for one viewport of scroll while the shell zooms out to its frame
 * (hero-shell-zoom.ts: CSS transforms only, no layout shift).
 */
export function HomepageShellHero({
  copy = HOMEPAGE_COPY.shell,
  headingId = 'home-hero-heading',
}: Readonly<{
  copy?: HomepageCopy['shell'];
  headingId?: string;
}>) {
  const beats = copy.headline.split('. ');
  return (
    <HomepageShellHeroFrame headingId={headingId}>
      <div className='shell-hero__sticky'>
        <div className='shell-hero__stage'>
          <div className='shell-hero__design'>
            <div className='shell-hero__head'>
              <h1 id={headingId} className='shell-hero__headline text-balance'>
                {beats.map((beat, index) => (
                  <span className='shell-hero__beat' key={beat}>
                    {beat}
                    {index < beats.length - 1 ? '. ' : ''}
                  </span>
                ))}
              </h1>
              <p className='shell-hero__support'>{copy.support}</p>
            </div>
            <figure className='shell-hero__shell' data-testid='hero-shell'>
              <picture>
                <source srcSet={SHELL_IMAGE.avif} type='image/avif' />
                <source srcSet={SHELL_IMAGE.webp} type='image/webp' />
                <img
                  src={SHELL_IMAGE.webp}
                  alt={copy.shellAlt}
                  width={SHELL_IMAGE.width}
                  height={SHELL_IMAGE.height}
                  sizes='(min-width: 1024px) 1248px, calc(100vw - 48px)'
                  decoding='async'
                  fetchPriority='high'
                  className='shell-hero__image'
                />
              </picture>
              <span aria-hidden='true' className='shell-hero__edge' />
            </figure>
            <div className='shell-hero__logos' data-testid='hero-logo-slot'>
              <HomepageLogoRow />
            </div>
          </div>
        </div>
      </div>
    </HomepageShellHeroFrame>
  );
}
