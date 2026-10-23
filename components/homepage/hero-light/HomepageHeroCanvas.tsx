'use client';

// NIGHT_DJ_HARMONY_V1: scoped WebGL exception — this hero's decorative layer
// only. See docs/design/night-dj-harmony-v1.md and the exception record in
// docs/performance/performance-invariants-v1.md.
import { useEffect, useRef } from 'react';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import { ArtistProfilePhoneFrame } from '@/components/marketing/artist-profile/ArtistProfilePhoneFrame';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
import { type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { HomepageHeroLight } from './HomepageHeroLight';
import './HomepageHeroCanvas.css';
import { bindHeroCanvasScroll } from './hero-light-scroll';

/**
 * Splits the locked headline into its sentence beats so each beat paints on
 * its own line. The accessible text is byte-identical to `headline` — the
 * spans only control wrapping, so a long beat can never orphan one word on
 * the final painted line (marketing-heading-layout spec, Firefox balance).
 */
function headlineBeats(headline: string): readonly string[] {
  return headline.split('. ');
}

/**
 * Shipped homepage hero. Full-bleed at rest, then a cinematic card whose
 * inset, radius, and header glass follow scroll position. The decorative
 * light paints the CSS poster first and upgrades to WebGL only when the
 * device can run it.
 *
 * The canonical docked marketing shell (PublicPageShell) owns the page
 * header: the `marketing-hero-dock` opt-in bleeds this hero's field under
 * that header to y=0 instead of replacing it. The claim form lives in the
 * copy column on the shared `ap-section-container` spine, next to the proof
 * it supports.
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
  const beats = headlineBeats(headline);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return bindHeroCanvasScroll(root);
  }, []);

  return (
    <section
      ref={rootRef}
      className='homepage-hero-canvas marketing-hero-dock'
      aria-labelledby={headingId}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.hero}
      data-testid='marketing-section-hero'
      data-marketing-owner={sectionOwner}
      data-marketing-variant={sectionVariant}
      data-marketing-section='hero'
      data-accent='ion'
      data-hero-canvas=''
    >
      <div className='homepage-hero-canvas__stage'>
        <div className='homepage-hero-canvas__field'>
          <HomepageHeroLight />
          <div className='homepage-hero-canvas__copy ap-section-container'>
            <h1
              id={headingId}
              className='marketing-type-display text-balance text-primary-token homepage-hero-canvas__headline'
            >
              {beats.map((beat, index) => (
                <span
                  className='homepage-hero-canvas__headline-beat'
                  key={beat}
                >
                  {beat}
                  {index < beats.length - 1 ? '. ' : ''}
                </span>
              ))}
            </h1>
            <p className='marketing-type-lede text-secondary-token homepage-hero-canvas__subhead'>
              {subhead}
            </p>
            <div
              className='homepage-artist-hero__claim'
              data-testid='homepage-hero-claim'
            >
              <ProductClaimHandleForm
                domain={claim.domain}
                placeholder={claim.placeholder}
                submitLabel={claim.action}
                inputId='homepage-claim-handle'
                testIdPrefix='homepage'
                submitTestId='homepage-primary-cta'
              />
              <p className='homepage-hero-canvas__support'>{supportNote}</p>
            </div>
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
