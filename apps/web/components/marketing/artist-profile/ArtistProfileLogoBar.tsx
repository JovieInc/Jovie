// @coverage-via apps/web/tests/unit/home/HomeTrustSection.test.tsx
import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
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
        <div className='flex w-full flex-wrap items-center justify-center gap-x-11 gap-y-6 text-primary-token/72'>
          {proofData.logos.map(logo => (
            <NormalizedTrustLogo
              key={logo.id}
              id={logo.id}
              className='max-w-43'
            />
          ))}
        </div>
        <ArtistProfileModeSwitcher
          adaptive={adaptive}
          phoneCaption={phoneCaption}
          phoneSubcaption={phoneSubcaption}
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
