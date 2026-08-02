import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { FaqSection } from '../FaqSection';

interface ArtistProfileFaqProps {
  readonly faq: ArtistProfileLandingCopy['faq'];
}

export function ArtistProfileFaq({ faq }: Readonly<ArtistProfileFaqProps>) {
  return (
    <div id='faq' className='homepage-faq-section'>
      <FaqSection
        items={[...faq.items]}
        heading={faq.headline}
        className='homepage-faq-section__inner'
        headingClassName='homepage-story-heading'
        analyticsEventName='artist_profiles_faq_opened'
        analyticsProperties={{ source: 'artist-profiles' }}
      />
    </div>
  );
}
