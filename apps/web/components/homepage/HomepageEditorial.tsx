// @coverage-via apps/web/tests/unit/home/homepage-contract.test.tsx
import { WaitlistRoleForm } from '@/components/features/waitlist/WaitlistRoleForm';
import { ArtistProfileSectionShell } from '@/components/marketing/artist-profile/ArtistProfileSectionShell';
import { MarketingHero } from '@/components/marketing/MarketingHero';
import { MarketingPhoneImage } from '@/components/marketing/MarketingPhoneImage';
import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import './HomepageEditorial.css';

const OWNER = 'apps/web/components/homepage/HomepageEditorial.tsx';

type HeroCopy = {
  readonly [K in keyof typeof HOMEPAGE_EDITORIAL_COPY.hero]: string;
};

/**
 * Hero: the locked line, one support sentence, one primary action that
 * scrolls to the on-page invitation form, and one quiet link to a real
 * profile. No signup link while public signup is closed.
 */
export function HomepageStoryHero({
  copy = HOMEPAGE_EDITORIAL_COPY.hero,
  headingId = 'home-hero-heading',
}: Readonly<{ copy?: HeroCopy; headingId?: string }>) {
  return (
    <MarketingHero
      headline={HOMEPAGE_EDITORIAL_COPY.hero.headline}
      subtitle={copy.subhead}
      headingId={headingId}
      testId='marketing-section-hero'
      sectionVariant='centered-none'
      sectionOwner={OWNER}
      align='center'
      headlineMaxLines={3}
      className='homepage-editorial-hero'
      primaryCta={{
        label: copy.primaryAction,
        href: copy.primaryHref,
        testId: 'homepage-primary-cta',
        prefetch: false,
      }}
      secondaryCta={{
        label: copy.secondaryAction,
        href: copy.secondaryHref,
        testId: 'homepage-hero-live-profile',
        prefetch: false,
      }}
    />
  );
}

interface ChapterCopy {
  readonly headline: string;
  readonly body: string;
}

/** jov.ie/you: the profile, shown as the real template capture. */
export function HomepageProfileChapter({
  copy = HOMEPAGE_EDITORIAL_COPY.profile,
}: Readonly<{ copy?: ChapterCopy }>) {
  const media = HOMEPAGE_EDITORIAL_COPY.profile;
  return (
    <ArtistProfileSectionShell
      className='homepage-editorial-chapter homepage-editorial-chapter--profile'
      containerClassName='homepage-editorial-split'
      sectionId='feature-split'
      sectionVariant='phone-right'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureSplit}
    >
      <div className='homepage-editorial-copy'>
        <h2 className='marketing-type-section text-balance text-primary-token'>
          {copy.headline}
        </h2>
        <p className='marketing-type-lede text-pretty text-secondary-token homepage-editorial-lede'>
          {copy.body}
        </p>
      </div>
      <div className='homepage-editorial-stage homepage-editorial-stage--phone'>
        <MarketingPhoneImage
          scenarioId={media.scenarioId}
          altOverride={media.alt}
          sizes='(min-width: 1024px) 340px, 72vw'
          className='homepage-editorial-phone'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}

/**
 * Releases: the real releases workspace, with the profile's featured
 * release layered in front of it. The release card leads on phones, where
 * the wide workspace would be too small to read.
 */
export function HomepageReleasesChapter({
  copy = HOMEPAGE_EDITORIAL_COPY.releases,
}: Readonly<{ copy?: ChapterCopy }>) {
  const media = HOMEPAGE_EDITORIAL_COPY.releases;
  return (
    <ArtistProfileSectionShell
      className='homepage-editorial-chapter'
      sectionId='product-gallery'
      sectionVariant='release-rail'
      sectionOwner={OWNER}
      penContractId={
        MARKETING_PEN_CONTRACT_IDS.section.productGalleryReleaseRail
      }
    >
      <div className='homepage-editorial-copy homepage-editorial-copy--wide'>
        <h2 className='marketing-type-section text-balance text-primary-token'>
          {copy.headline}
        </h2>
        <p className='marketing-type-lede text-pretty text-secondary-token homepage-editorial-lede'>
          {copy.body}
        </p>
      </div>
      {/* One section accent (Ultra), matched to the featured release art. */}
      <div className='homepage-editorial-layers' data-accent='ultra'>
        <div className='homepage-editorial-workspace'>
          <MarketingScreenshot
            scenarioId={media.workspace.scenarioId}
            altOverride={media.workspace.alt}
            sizes='(min-width: 1024px) 1120px, 100vw'
          />
        </div>
        <MarketingPhoneImage
          scenarioId={media.release.scenarioId}
          altOverride={media.release.alt}
          sizes='(min-width: 1024px) 320px, 88vw'
          className='homepage-editorial-release'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}

/** Close: the role waitlist form, the page's one conversion. */
export function HomepageInviteClose({
  copy = HOMEPAGE_EDITORIAL_COPY.invite,
}: Readonly<{
  copy?: { readonly headline: string; readonly subhead: string };
}>) {
  return (
    <ArtistProfileSectionShell
      id={HOMEPAGE_INVITE_ANCHOR}
      className='homepage-editorial-chapter homepage-editorial-invite'
      sectionId='cta'
      sectionVariant='final-single-claim'
      sectionOwner={OWNER}
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.cta}
    >
      <div className='homepage-editorial-invite__inner'>
        <WaitlistRoleForm
          headingLevel={2}
          title={copy.headline}
          description={copy.subhead}
          headingClassName='marketing-type-section'
          align='start'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
