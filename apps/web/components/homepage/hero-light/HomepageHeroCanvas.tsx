'use client';

// NIGHT_DJ_HARMONY_V1: scoped WebGL exception — this hero's decorative layer
// only. See docs/design/night-dj-harmony-v1.md and the exception record in
// docs/performance/performance-invariants-v1.md.
import { useEffect, useRef } from 'react';
import { ProductClaimHandleForm } from '@/app/(marketing)/product/ProductClaimHandleForm';
import '@/components/marketing/artist-profile/ArtistProfileSectionShell.css';
import { ProductScreenshotFrame } from '@/components/marketing/ProductScreenshotFrame';
import { ProductShot } from '@/components/marketing/ProductShot';
import { type HomepageCopy } from '@/data/homepageCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import type { ProductShotId } from '@/lib/screenshots/product-shots';
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
 * that header to y=0 instead of replacing it. The hero content sits on the
 * shared `ap-section-container` spine: the lead (headline, subhead, claim)
 * on the left and, when a capture is passed, the real product shot on the
 * right at desktop widths, stacked under the claim on phones.
 */
export function HomepageHeroCanvas({
  headingId,
  headline,
  subhead,
  claim,
  supportNote,
  profile,
  proofShot,
  sectionOwner,
  sectionVariant = 'split-claim-card',
  headingTestId,
  claimTestId = 'homepage-hero-claim',
  claimInputId = 'homepage-claim-handle',
  claimTestIdPrefix = 'homepage',
  claimSubmitTestId = 'homepage-primary-cta',
}: Readonly<{
  headingId: string;
  headline: HomepageCopy['hero']['headline'];
  subhead: HomepageCopy['hero']['subhead'];
  claim: HomepageCopy['hero']['claim'];
  supportNote: HomepageCopy['hero']['supportNote'];
  /**
   * Optional proof capture: a registry scenario rendered from the real
   * profile components. The homepage passes the template profile
   * (`template-profile-live-mobile`), never a real person's face on `/`
   * (Tim, 2026-10-26).
   */
  profile?: { readonly scenarioId: string; readonly alt: string };
  /**
   * A registry product shot (lib/screenshots/product-shots.ts) cropped to
   * one moment. Takes precedence over `profile`; the homepage uses it.
   */
  proofShot?: ProductShotId;
  sectionOwner: string;
  /**
   * Registry identity for the section.hero occurrence this canvas renders.
   * The occurrence owner (HomepageArtistProfile) wires the variant; the
   * default keeps the shipped homepage look when it is omitted.
   */
  sectionVariant?: string;
  headingTestId?: string;
  /**
   * Test and form identity for the claim control. The homepage keeps the
   * defaults; a product page passes its own so its tests and analytics
   * names stay stable when it adopts this treatment.
   */
  claimTestId?: string;
  claimInputId?: string;
  claimTestIdPrefix?: string;
  claimSubmitTestId?: string;
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
          <div
            className='homepage-hero-canvas__copy ap-section-container'
            data-has-proof={profile || proofShot ? 'true' : undefined}
          >
            <div className='homepage-hero-canvas__lead'>
              <h1
                id={headingId}
                data-testid={headingTestId}
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
                className='homepage-hero-canvas__conversion'
                data-testid={claimTestId}
              >
                <ProductClaimHandleForm
                  domain={claim.domain}
                  placeholder={claim.placeholder}
                  submitLabel={claim.action}
                  inputId={claimInputId}
                  testIdPrefix={claimTestIdPrefix}
                  submitTestId={claimSubmitTestId}
                />
                <p className='homepage-hero-canvas__support'>{supportNote}</p>
              </div>
            </div>
            {proofShot ? (
              <div
                className='homepage-hero-canvas__proof homepage-hero-canvas__proof--shot'
                data-testid='homepage-hero-proof'
              >
                <ProductShot
                  id={proofShot}
                  priority
                  sizes='(min-width: 64rem) 25rem, 90vw'
                />
              </div>
            ) : profile ? (
              <div
                className='homepage-hero-canvas__proof'
                data-testid='homepage-hero-proof'
              >
                <ProductScreenshotFrame
                  scenarioId={profile.scenarioId}
                  altOverride={profile.alt}
                  device='phone'
                  fill
                  priority
                  sizes='(min-width: 64rem) 22rem, 18rem'
                  className='homepage-hero-canvas__shot'
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
