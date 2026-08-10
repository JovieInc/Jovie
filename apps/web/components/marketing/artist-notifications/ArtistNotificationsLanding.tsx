// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import { MarketingPageShell } from '@/components/marketing';
import type { ArtistNotificationsLandingCopy } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_NOTIFICATIONS_SECTION_TEST_IDS } from '@/data/artistNotificationsPageOrder';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { HomeTrustSection } from '@/features/home/HomeTrustSection';
import { ArtistProfileCaptureSection } from '../artist-profile/ArtistProfileCaptureSection';
import { ArtistProfileFaq } from '../artist-profile/ArtistProfileFaq';
import { ArtistProfileFinalCta } from '../artist-profile/ArtistProfileFinalCta';
import { ArtistProfileReactivationSection } from '../artist-profile/ArtistProfileReactivationSection';
import { ArtistProfileSpecWall } from '../artist-profile/ArtistProfileSpecWall';
import { ArtistNotificationsBenefitsSection } from './ArtistNotificationsBenefitsSection';
import { ArtistNotificationsHero } from './ArtistNotificationsHero';

interface ArtistNotificationsLandingProps {
  readonly copy: ArtistNotificationsLandingCopy;
}

export function ArtistNotificationsLanding({
  copy,
}: Readonly<ArtistNotificationsLandingProps>) {
  return (
    <MarketingPageShell
      penContractId={MARKETING_PEN_CONTRACT_IDS.recipe.feature}
    >
      <main className='overflow-hidden bg-black dark:bg-black text-primary-token'>
        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.hero}>
          <ArtistNotificationsHero hero={copy.hero} />
        </div>

        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.trust}>
          <HomeTrustSection />
        </div>

        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.capture}>
          <ArtistProfileCaptureSection capture={copy.capture} />
        </div>

        <div
          id='how-it-works'
          data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.reactivation}
        >
          <ArtistProfileReactivationSection
            notification={copy.capture.notification}
            reactivation={copy.reactivation}
          />
        </div>

        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.benefits}>
          <ArtistNotificationsBenefitsSection benefits={copy.benefits} />
        </div>

        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.specWall}>
          <ArtistProfileSpecWall
            specWall={copy.specWall}
            tiles={ARTIST_NOTIFICATIONS_SPEC_TILES}
          />
        </div>

        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.faq}>
          <ArtistProfileFaq faq={copy.faq} />
        </div>

        <div data-testid={ARTIST_NOTIFICATIONS_SECTION_TEST_IDS.finalCta}>
          <ArtistProfileFinalCta
            finalCta={copy.finalCta}
            ctaHref={copy.finalCta.ctaHref}
          />
        </div>
      </main>
    </MarketingPageShell>
  );
}
