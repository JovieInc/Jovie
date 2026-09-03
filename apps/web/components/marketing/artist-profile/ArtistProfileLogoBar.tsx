// @coverage-via apps/web/tests/unit/home/HomeTrustSection.test.tsx
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileLogoBar.css';

interface ArtistProfileLogoBarProps {
  readonly proofData: ArtistProfileSocialProofData;
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
}

export function ArtistProfileLogoBar({
  proofData,
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileLogoBarProps>) {
  return (
    <ArtistProfileSectionShell className='ap-logo-bar py-10 sm:py-12 lg:py-16'>
      <div className='flex flex-col items-center text-center'>
        <HomeTrustSection
          presentation='artist-profile'
          ariaLabel='Distribution partners'
          logoIds={proofData.logos.map(logo => logo.id)}
        />
        <ArtistProfileModeSwitcher
          adaptive={adaptive}
          phoneCaption={phoneCaption}
          phoneSubcaption={phoneSubcaption}
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
