import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type {
  ArtistProfileFeatureTile,
  ArtistProfileLaunchFeature,
} from '@/data/artistProfileFeatures';
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
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';
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
  if (!flags.FULL_PAGE) {
    return (
      <>
        <HomeHero layout='f' />
        <HomeTrustSection />
      </>
    );
  }

  return (
    <>
      <HomeHero layout='f' />
      <HomeTrustSection />
      <ArtistProfileAdaptiveSequence
        adaptive={copy.adaptive}
        phoneCaption={copy.hero.phoneCaption}
        phoneSubcaption={copy.hero.phoneSubcaption}
      />
      <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
      <ArtistProfileMonetizationSection monetization={copy.monetization} />
      <ArtistProfileCaptureSection capture={copy.capture} />
      <ArtistProfileOpinionatedSection opinionated={copy.opinionated} />
      <ArtistProfileSpecWall specWall={copy.specWall} tiles={specTiles} />
      <ArtistProfileHowItWorks howItWorks={copy.howItWorks} />
      {flags.SOCIAL_PROOF ? (
        <ArtistProfileSocialProof
          socialProof={copy.socialProof}
          proofData={socialProof}
        />
      ) : null}
      {flags.FAQ ? <ArtistProfileFaq faq={copy.faq} /> : null}
      <ArtistProfileFinalCta finalCta={copy.finalCta} />
    </>
  );
}
