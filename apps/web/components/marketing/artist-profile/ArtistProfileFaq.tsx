import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { FaqSection } from '../FaqSection';
import './ArtistProfileFaq.css';

interface ArtistProfileFaqProps {
  readonly faq: ArtistProfileLandingCopy['faq'];
}

export function ArtistProfileFaq({ faq }: Readonly<ArtistProfileFaqProps>) {
  return (
    <div id='faq' className='artist-profile-faq'>
      <FaqSection
        items={[...faq.items]}
        heading={faq.headline}
        className='artist-profile-faq__inner'
        headingClassName='artist-profile-faq__heading'
        analyticsEventName='artist_profiles_faq_opened'
        analyticsProperties={{ source: 'artist-profiles' }}
      />
    </div>
  );
}
