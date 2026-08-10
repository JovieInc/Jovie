// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import ONBOARDING_DSP_CAPTURE from '@/screenshot-catalog/current/onboarding-dsp-desktop.png';
import ONBOARDING_HANDLE_CAPTURE from '@/screenshot-catalog/current/onboarding-handle-desktop.png';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

const LIVE_PROFILE = getMarketingExportImage('tim-white-profile-live-mobile');

const SETUP_STAGES = [
  {
    id: 'claim',
    label: 'Claim',
    detail: TIM_WHITE_PROFILE.publicProfileDisplay,
    src: ONBOARDING_HANDLE_CAPTURE,
    alt: 'Jovie onboarding with the Tim White profile handle ready to claim.',
  },
  {
    id: 'connect',
    label: 'Connect',
    detail: 'Import your catalog',
    src: ONBOARDING_DSP_CAPTURE,
    alt: 'Jovie onboarding asking an artist to connect their music catalog.',
  },
  {
    id: 'share',
    label: 'Share',
    detail: `${TIM_WHITE_PROFILE.publicProfileDisplay} is live`,
    src: LIVE_PROFILE.publicUrl,
    alt: "Tim White's live Jovie artist profile ready to share from one link.",
  },
] as const;

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.howItWorks}
    >
      <div className='mx-auto grid max-w-public-content items-start gap-12 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(36rem,1.28fr)] lg:gap-16'>
        <div>
          <ArtistProfileSectionHeader
            align='left'
            headline={howItWorks.headline}
            body={howItWorks.body}
            className='max-w-xl'
            bodyClassName='max-w-md'
          />

          <ol className='mt-9 border-t border-subtle'>
            {howItWorks.steps.map((step, index) => (
              <li
                key={step.id}
                className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-subtle py-5'
              >
                <span className='font-mono text-3xs text-tertiary-token'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className='text-sm font-semibold text-primary-token'>
                    {step.title}
                  </h3>
                  <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure className='ap-how-it-works__product-window relative overflow-hidden border border-subtle bg-surface-0'>
          <div className='ap-how-it-works__window-bar flex items-center gap-2 border-b border-subtle px-4 py-3'>
            <span aria-hidden='true' />
            <span aria-hidden='true' />
            <span aria-hidden='true' />
            <figcaption className='ml-2 font-mono text-3xs text-tertiary-token'>
              Set up your profile
            </figcaption>
          </div>
          <ol className='ap-how-it-works__setup-flow'>
            {SETUP_STAGES.map((stage, index) => (
              <li
                key={stage.id}
                className={`ap-how-it-works__setup-stage ap-how-it-works__setup-stage--${stage.id}`}
              >
                <div className='ap-how-it-works__setup-stage-header'>
                  <span className='font-mono text-3xs text-tertiary-token'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <strong className='text-sm font-semibold text-primary-token'>
                    {stage.label}
                  </strong>
                  <span className='ap-how-it-works__setup-stage-detail font-mono text-3xs text-tertiary-token'>
                    {stage.detail}
                  </span>
                </div>
                <div className='ap-how-it-works__setup-media'>
                  <Image
                    fill
                    src={stage.src}
                    alt={stage.alt}
                    className={`ap-how-it-works__setup-image ap-how-it-works__setup-image--${stage.id}`}
                    sizes='(min-width: 1024px) 48rem, 100vw'
                  />
                </div>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </ArtistProfileSectionShell>
  );
}
