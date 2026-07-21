import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileTruthTile } from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import type { ArtistProfileSectionFlags } from '@/lib/featureFlags';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import { ArtistProfileHero } from './ArtistProfileHero';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';
import { ArtistProfileOutcomesCarousel } from './ArtistProfileOutcomesCarousel';
import { ArtistProfileSocialProof } from './ArtistProfileSocialProof';
import { ArtistProfileSpecWall } from './ArtistProfileSpecWall';

interface ArtistProfileLandingPageProps {
 readonly copy: ArtistProfileLandingCopy;
 readonly truthTiles: readonly ArtistProfileTruthTile[];
 readonly socialProof: ArtistProfileSocialProofData;
 readonly flags: ArtistProfileSectionFlags;
}

export function ArtistProfileLandingPage({
 copy,
 truthTiles,
 socialProof,
 flags,
}: Readonly<ArtistProfileLandingPageProps>) {
 if (!flags.FULL_PAGE) {
 return (
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
 <ArtistProfileHero hero={copy.hero} />
 </div>
 );
 }

 return (
 <>
 <ArtistProfileHeroAdaptiveIntro
 hero={copy.hero}
 adaptive={copy.adaptive}
 />
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.outcomes}>
 <ArtistProfileOutcomesCarousel outcomes={copy.outcomes} />
 </div>
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.capture}>
 <ArtistProfileCaptureSection
 capture={copy.capture}
 id='capture-every-fan'
 />
 </div>
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.opinionated}>
 <ArtistProfileOpinionatedSection opinionated={copy.opinionated} />
 </div>
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.specWall}>
 <ArtistProfileSpecWall
 specWall={copy.specWall}
 truthTiles={truthTiles}
 />
 </div>
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.howItWorks}>
 <ArtistProfileHowItWorks howItWorks={copy.howItWorks} />
 </div>
 {flags.SOCIAL_PROOF && socialProof.hasRealQuotes ? (
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
 <ArtistProfileFinalCta finalCta={copy.finalCta} roomy showSignature />
 </div>
 </>
 );
}
