'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_COPY, type HomepageCopy } from '@/data/homepageCopy';
import { HomepageHeroLight } from './HomepageHeroLight';
import './HomepageHeroCanvas.css';
import {
  HERO_CANVAS_BRAND_LABEL,
  HERO_CANVAS_HEADLINE,
  HERO_CANVAS_SIGN_IN,
  type HomepageHeroLightRenderer,
} from './hero-light-gate';
import { bindHeroCanvasScroll } from './hero-light-scroll';

const HOMEPAGE_LOGO_PLACEMENT = { page: '/' } as const;

/**
 * Flagged hero. Full-bleed at rest, then a cinematic card whose inset,
 * radius, and header glass follow scroll position. The shipped hero does
 * not render this.
 */
export function HomepageHeroCanvas({
  renderer,
  headingId,
  copy = HOMEPAGE_COPY.hero,
}: Readonly<{
  renderer: HomepageHeroLightRenderer;
  headingId: string;
  copy?: HomepageCopy['hero'];
}>) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return bindHeroCanvasScroll(root);
  }, []);

  return (
    <section
      ref={rootRef}
      className='homepage-hero-canvas'
      data-testid='marketing-section-hero'
      data-hero-canvas=''
      data-marketing-section='hero'
    >
      <header className='homepage-hero-canvas__bar'>
        <div className='homepage-hero-canvas__bar-plate'>
          <Link
            href={APP_ROUTES.HOME}
            aria-label={HERO_CANVAS_BRAND_LABEL}
            className='homepage-hero-canvas__brand'
          >
            <BrandLogo size='splash' tone='white' alt='' aria-hidden />
          </Link>
          <div className='homepage-hero-canvas__claim'>
            <ProductClaimHandleForm
              domain={copy.claim.domain}
              placeholder={copy.claim.placeholder}
              submitLabel={copy.claim.action}
              inputId='homepage-claim-handle'
              testIdPrefix='homepage'
              submitTestId='homepage-primary-cta'
            />
          </div>
          <Link
            href={APP_ROUTES.SIGNIN}
            className='homepage-hero-canvas__sign-in'
          >
            {HERO_CANVAS_SIGN_IN}
          </Link>
        </div>
      </header>
      <div className='homepage-hero-canvas__stage'>
        <div className='homepage-hero-canvas__field'>
          <HomepageHeroLight renderer={renderer} />
          <div className='homepage-hero-canvas__copy'>
            <h1
              id={headingId}
              className='marketing-type-display homepage-hero-canvas__headline'
            >
              {HERO_CANVAS_HEADLINE}
            </h1>
          </div>
        </div>
        <div className='homepage-hero-canvas__logos homepage-hero-canvas__logos-rail'>
          <HomeTrustSection
            placement={HOMEPAGE_LOGO_PLACEMENT}
            presentation='inline-strip'
            variant='compact'
            ariaLabel='Distribution partners'
          />
        </div>
      </div>
    </section>
  );
}
