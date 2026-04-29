import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type {
  ArtistProfileFeatureTile,
  ArtistProfileLaunchFeature,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { HomeTrustSection } from '@/features/home/HomeTrustSection';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import { ArtistProfileHero } from './ArtistProfileHero';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';
import { ArtistProfileMonetizationSection } from './ArtistProfileMonetizationSection';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';
import { ArtistProfilePayFlowVideoSection } from './ArtistProfilePayFlowVideoSection';
import { ArtistProfileReactivationSection } from './ArtistProfileReactivationSection';
import { ArtistProfileSocialProof } from './ArtistProfileSocialProof';
import { ArtistProfileSpecWall } from './ArtistProfileSpecWall';

interface ArtistProfileLandingPageProps {
  readonly copy: ArtistProfileLandingCopy;
  readonly launchFeatures: readonly ArtistProfileLaunchFeature[];
  readonly specTiles: readonly ArtistProfileFeatureTile[];
  readonly socialProof: ArtistProfileSocialProofData;
  readonly flags: ArtistProfileSectionFlags;
  readonly payFlowVideoUrl?: string;
}

export function ArtistProfileLandingPage({
  copy,
  launchFeatures: _launchFeatures,
  specTiles,
  socialProof,
  flags,
  payFlowVideoUrl,
}: Readonly<ArtistProfileLandingPageProps>) {
  if (!flags.FULL_PAGE) {
    return (
      <>
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
          <ArtistProfileHero hero={copy.hero} />
        </div>
        <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.trust}>
          <HomeTrustSection />
        </div>
      </>
    );
  }

  return (
    // The cinematic frame-skin design layer is scoped per-section instead of
    // wrapping the whole page, so each section can iterate independently and
    // sections that haven't adopted the frame.io treatment render in their
    // pre-existing style. Today only the hero adaptive intro opts in (it
    // anchors the page with the editorial top edge-glow + film grain).
    // Add `frame-skin` to other section wrappers as they migrate.
    <>
      <div className='frame-skin'>
        <ArtistProfileHeroAdaptiveIntro
          hero={copy.hero}
          adaptive={copy.adaptive}
          phoneCaption={copy.hero.phoneCaption}
          phoneSubcaption={copy.hero.phoneSubcaption}
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.outcomes}>
        <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.capture}>
        <ArtistProfileCaptureSection
          capture={copy.capture}
          id='capture-every-fan'
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.reactivation}>
        <ArtistProfileReactivationSection
          id='bring-them-back-automatically'
          notification={copy.capture.notification}
          reactivation={copy.reactivation}
        />
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.monetization}>
        {FEATURE_FLAGS.SHOW_ARTIST_PROFILE_PAY_FLOW_VIDEO ? (
          <ArtistProfilePayFlowVideoSection
            copy={copy.payFlowVideo}
            monetization={copy.monetization}
            videoUrl={payFlowVideoUrl}
          />
        ) : (
          <ArtistProfileMonetizationSection monetization={copy.monetization} />
        )}
      </div>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.specWall}>
        <ArtistProfileSpecWall specWall={copy.specWall} tiles={specTiles} />
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
        <ArtistProfileFinalCta finalCta={copy.finalCta} roomy />
      </div>
    </>
  );
}
