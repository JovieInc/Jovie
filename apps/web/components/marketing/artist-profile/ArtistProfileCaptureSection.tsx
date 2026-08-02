import Image from 'next/image';
import type {
  ArtistProfileCaptureVisualCopy,
  ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfileCaptureVisual } from '../MarketingStoryPrimitives';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileCaptureSection.css';

interface ArtistProfileCaptureSectionProps {
  readonly id?: string;
  readonly capture:
    | ArtistProfileCaptureVisualCopy
    | ArtistProfileLandingCopy['capture'];
}

const SUBSCRIBE_PROFILE = getMarketingExportImage(
  'tim-white-profile-subscribe-mobile'
);

function isEditorialCapture(
  capture: ArtistProfileCaptureSectionProps['capture']
): capture is ArtistProfileLandingCopy['capture'] {
  return 'journey' in capture && 'benefits' in capture;
}

export function ArtistProfileCaptureSection({
  id,
  capture,
}: Readonly<ArtistProfileCaptureSectionProps>) {
  if (!isEditorialCapture(capture)) {
    return (
      <ArtistProfileSectionShell className='ap-capture-section--visual' id={id}>
        <div className='mx-auto max-w-280'>
          <ArtistProfileSectionHeader
            align='center'
            headline={capture.headline}
            body={capture.subhead}
            className='max-w-184'
            bodyClassName='mx-auto max-w-136'
          />

          <ArtistProfileCaptureVisual capture={capture} className='mt-10' />
        </div>
      </ArtistProfileSectionShell>
    );
  }

  return (
    <ArtistProfileSectionShell className='ap-capture-loop bg-surface-0' id={id}>
      <div className='ap-capture-loop__layout mx-auto grid max-w-public-content items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(30rem,1.2fr)] lg:gap-20'>
        <div>
          <ArtistProfileSectionHeader
            align='left'
            headline={capture.headline}
            body={capture.body}
            className='max-w-3xl'
            bodyClassName='max-w-xl'
          />
          <ol className='mt-9 border-t border-subtle'>
            {capture.benefits.map((benefit, index) => (
              <li
                key={benefit.id}
                className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-subtle py-4'
              >
                <span className='font-mono text-3xs text-tertiary-token'>
                  0{index + 1}
                </span>
                <div>
                  <p className='text-sm font-semibold text-primary-token'>
                    {benefit.label}
                  </p>
                  <p className='mt-1.5 text-app leading-relaxed text-secondary-token'>
                    {benefit.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure
          className='ap-capture-loop__visual relative flex min-h-128 items-center justify-center'
          data-testid='artist-profile-capture-demo'
        >
          <figcaption className='sr-only'>
            Fan relationship loop: a fan acts, opts in, and hears from the
            artist again.
          </figcaption>
          <div className='ap-capture-loop__ring' aria-hidden='true' />
          <span className='ap-capture-loop__node ap-capture-loop__node--act'>
            Fan Acts
          </span>
          <span className='ap-capture-loop__node ap-capture-loop__node--opt-in'>
            Opts In
          </span>
          <span className='ap-capture-loop__node ap-capture-loop__node--return'>
            Hears From You Again
          </span>
          <ArtistProfilePhoneFrame className='ap-capture-loop__phone'>
            <Image
              fill
              src={SUBSCRIBE_PROFILE.publicUrl}
              alt='Jovie artist profile showing a fan email and SMS opt-in.'
              className='object-cover object-top'
              sizes='(min-width: 1024px) 18rem, 16rem'
            />
          </ArtistProfilePhoneFrame>
        </figure>
      </div>
    </ArtistProfileSectionShell>
  );
}
