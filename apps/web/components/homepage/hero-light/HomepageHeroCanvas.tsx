'use client';

// NIGHT_DJ_HARMONY_V1: scoped WebGL exception — this hero's decorative layer
// only. See docs/design/night-dj-harmony-v1.md and the exception record in
// docs/performance/performance-invariants-v1.md.
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
import { APP_ROUTES } from '@/constants/routes';
import { type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { HomepageHeroLight } from './HomepageHeroLight';
import './HomepageHeroCanvas.css';
import {
  HERO_CANVAS_BRAND_LABEL,
  HERO_CANVAS_SIGN_IN,
} from './hero-light-gate';
import { bindHeroCanvasScroll } from './hero-light-scroll';

/**
 * Shipped homepage hero. Full-bleed at rest, then a cinematic card whose
 * inset, radius, and header glass follow scroll position. The decorative
 * light paints the CSS poster first and upgrades to WebGL only when the
 * device can run it.
 */
export function HomepageHeroCanvas({
  headingId,
  headline,
  subhead,
  claim,
  supportNote,
  profile,
  sectionOwner,
  sectionVariant = 'split-claim-card',
}: Readonly<{
  headingId: string;
  headline: HomepageCopy['hero']['headline'];
  subhead: HomepageCopy['hero']['subhead'];
  claim: HomepageCopy['hero']['claim'];
  supportNote: HomepageCopy['hero']['supportNote'];
  profile: HomepageCopy['hero']['profile'];
  sectionOwner: string;
  /**
   * Registry identity for the section.hero occurrence this canvas renders.
   * The occurrence owner (HomepageArtistProfile) wires the variant; the
   * default keeps the shipped homepage look when it is omitted.
   */
  sectionVariant?: string;
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
      aria-labelledby={headingId}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.hero}
      data-testid='marketing-section-hero'
      data-marketing-owner={sectionOwner}
      data-marketing-variant={sectionVariant}
      data-marketing-section='hero'
      data-accent='ion'
      data-hero-canvas=''
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
              domain={claim.domain}
              placeholder={claim.placeholder}
              submitLabel={claim.action}
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
          <HomepageHeroLight />
          <div className='homepage-hero-canvas__copy'>
            <h1
              id={headingId}
              className='marketing-type-display text-balance text-primary-token homepage-hero-canvas__headline'
            >
              {headline}
            </h1>
            <p className='marketing-type-lede text-secondary-token homepage-hero-canvas__subhead'>
              {subhead}
            </p>
            <p className='homepage-hero-canvas__support'>{supportNote}</p>
          </div>
          <div className='homepage-hero-canvas__proof'>
            <ArtistProfilePhoneFrame className='homepage-artist-hero__phone'>
              <MarketingPhoneImage
                scenarioId={profile.scenarioId}
                altOverride={profile.alt}
                fill
                priority
                sizes='(min-width: 1024px) 21.25rem, (min-width: 768px) 18rem, 72vw'
                className='object-cover object-top'
              />
            </ArtistProfilePhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
