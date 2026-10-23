'use client';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DspQuietRow } from '@/components/molecules/inspector/DspQuietRow';
import { DSP_LINKS_FIXTURE } from '@/data/dspLinksCopy';

/** Client island: Find opens the shipped search URL for a missing service. */
export function DspLinksList() {
  return (
    <div data-testid='dsp-links' className='space-y-0.5'>
      {DSP_LINKS_FIXTURE.services.map(service => (
        <DspQuietRow
          key={service.key}
          label={service.label}
          href={service.href}
          testId={`dsp-link-${service.key}`}
          icon={
            <SocialIcon
              platform={service.key}
              className='h-4 w-4'
              aria-hidden
            />
          }
          onFind={
            service.href
              ? undefined
              : () => {
                  globalThis.open(
                    DSP_LINKS_FIXTURE.findUrl,
                    '_blank',
                    'noopener,noreferrer'
                  );
                }
          }
        />
      ))}
    </div>
  );
}
