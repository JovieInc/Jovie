// @coverage-via apps/web/tests/unit/home/homepage-anatomy-contract.test.tsx
import { FaqSection } from '@/components/marketing/FaqSection';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

/**
 * Homepage FAQ: the shared marketing FaqSection (Pen contract pAAhw) with the
 * identity homepage's ICP-agnostic answers, styled by the mounted System B
 * FAQ block in app/(home)/home.css. The page emits the matching FAQPage
 * JSON-LD from the same copy.
 */
export function HomepageIdentityFaq() {
  const { faq } = HOMEPAGE_IDENTITY_COPY;

  return (
    <div className='homepage-faq-section' data-homepage-testid='homepage-faq'>
      <FaqSection
        sectionVariant='structured-data-list'
        heading={faq.heading}
        items={faq.items}
        analyticsEventName='homepage_faq_opened'
      />
    </div>
  );
}
