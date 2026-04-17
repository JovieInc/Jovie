import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

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
    <ArtistProfileSectionShell className='bg-white/[0.012] py-10 sm:py-12 lg:py-16'>
      <div className='flex flex-col items-center text-center'>
        <div className='flex w-full flex-wrap items-center justify-center gap-x-11 gap-y-6 text-primary-token/72'>
          {proofData.logos.map(logo => {
            const Logo = logo.component;
            return (
              <Logo
                key={logo.id}
                className='h-[22px] w-auto max-w-[170px]'
                aria-label={logo.label}
              />
            );
          })}
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
