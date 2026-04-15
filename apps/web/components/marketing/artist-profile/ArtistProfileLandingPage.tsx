import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type {
  ArtistProfileFeatureTile,
  ArtistProfileLaunchFeature,
} from '@/data/artistProfileFeatures';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { HomeHero } from '@/features/home/HomeAdaptiveProfileStory';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';
import { ArtistProfileLogoBar } from './ArtistProfileLogoBar';
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
    return <HomeHero layout='f' />;
  }

  return (
    <>
      <HomeHero layout='f' />
      <ArtistProfileLogoBar proofData={socialProof} adaptive={copy.adaptive} />
      <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
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
