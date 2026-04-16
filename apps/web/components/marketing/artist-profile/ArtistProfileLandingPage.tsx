import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type {
  ArtistProfileFeatureTile,
  ArtistProfileLaunchFeature,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { HomeHero } from '@/features/home/HomeAdaptiveProfileStory';
import { HomeTrustSection } from '@/features/home/HomeTrustSection';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';
import { ArtistProfileAdaptiveSequence } from './ArtistProfileAdaptiveSequence';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';
import { ArtistProfileMonetizationSection } from './ArtistProfileMonetizationSection';
import { ArtistProfileReactivationSection } from './ArtistProfileOpinionatedSection';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';
import { ArtistProfileSocialProof } from './ArtistProfileSocialProof';
import { ArtistProfileSpecWall } from './ArtistProfileSpecWall';

interface ArtistProfileLandingPageProps {
  readonly copy: ArtistProfileLandingCopy;
  readonly launchFeatures: readonly ArtistProfileLaunchFeature[];
  readonly specTiles: readonly ArtistProfileFeatureTile[];
  readonly socialProof: ArtistProfileSocialProofData;
  readonly flags: ArtistProfileSectionFlags;
}

export function ArtistProfileLandingPage({
  copy,
  launchFeatures: _launchFeatures,
  specTiles,
  socialProof,
  flags,
}: Readonly<ArtistProfileLandingPageProps>) {
  const payMode =
    copy.adaptive.modes.find(mode => mode.id === 'pay') ??
    copy.adaptive.modes[0];

  if (!flags.FULL_PAGE) {
    return (
      <>
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
          <HomeHero showPhoneComposition={false} variant='artist-profile' />
        </div>
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.trust}>
          <HomeTrustSection />
        </div>
      </>
    );
  }

  return (
    <>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <HomeHero showPhoneComposition={false} variant='artist-profile' />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}>
        <ArtistProfileAdaptiveSequence
          adaptive={copy.adaptive}
          phoneCaption={copy.hero.phoneCaption}
          phoneSubcaption={copy.hero.phoneSubcaption}
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.trust}>
        <HomeTrustSection />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.outcomes}>
        <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.monetization}>
        <ArtistProfileMonetizationSection
          monetization={copy.monetization}
          payMode={payMode}
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.capture}>
        <ArtistProfileCaptureSection capture={copy.capture} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.reactivation}>
        <ArtistProfileReactivationSection reactivation={copy.reactivation} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.specWall}>
        <ArtistProfileSpecWall
          opinionated={copy.opinionated}
          specWall={copy.specWall}
          tiles={specTiles}
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.howItWorks}>
        <ArtistProfileHowItWorks howItWorks={copy.howItWorks} />
      </div>
      {flags.SOCIAL_PROOF ? (
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.socialProof}>
          <ArtistProfileSocialProof
            socialProof={copy.socialProof}
            proofData={socialProof}
          />
        </div>
      ) : null}
      {flags.FAQ ? (
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.faq}>
          <ArtistProfileFaq faq={copy.faq} />
        </div>
      ) : null}
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.finalCta}>
        <ArtistProfileFinalCta finalCta={copy.finalCta} />
      </div>
    </>
  );
}
