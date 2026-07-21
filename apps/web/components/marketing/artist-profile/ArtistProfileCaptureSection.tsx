import { ArrowRight, BellRing, Check } from 'lucide-react';
import type {
  ArtistProfileCaptureVisualCopy,
  ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { ArtistProfileCaptureVisual } from '../MarketingStoryPrimitives';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileCaptureSection.css';

interface ArtistProfileCaptureSectionProps {
  readonly id?: string;
  readonly capture:
    | ArtistProfileCaptureVisualCopy
    | ArtistProfileLandingCopy['capture'];
}

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
    <ArtistProfileSectionShell className='bg-surface-0' id={id}>
      <div className='mx-auto max-w-280'>
        <ArtistProfileSectionHeader
          align='left'
          headline={capture.headline}
          body={capture.body}
          className='max-w-3xl'
          bodyClassName='max-w-2xl'
        />

        <div
          className='mt-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] lg:gap-6'
          data-testid='artist-profile-capture-demo'
        >
          <article
            role='img'
            aria-label={capture.journey.inputPreviewLabel}
            className='flex min-h-64 flex-col justify-between rounded-2xl border border-subtle bg-surface-1 p-5 sm:p-6'
          >
            <div>
              <p className='text-xs font-semibold text-secondary-token'>
                {capture.journey.inputEyebrow}
              </p>
              <h3 className='mt-3 text-2xl font-semibold tracking-tight text-primary-token'>
                {capture.action.title}
              </h3>
              <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                {capture.action.detail}
              </p>
            </div>

            <div
              aria-hidden='true'
              className='mt-8 rounded-xl border border-subtle bg-surface-0 p-2'
            >
              <div className='flex items-center gap-2'>
                <div className='min-w-0 flex-1 rounded-lg border border-subtle bg-surface-1 px-3 py-3 font-mono text-xs text-tertiary-token'>
                  {capture.action.inputPlaceholder}
                </div>
                <span className='inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary-token px-4 text-xs font-semibold text-surface-1'>
                  {capture.action.ctaLabel}
                </span>
              </div>
              <p className='mt-3 flex items-center gap-2 px-1 pb-1 text-xs font-medium text-secondary-token'>
                <Check
                  className='h-3.5 w-3.5 text-success'
                  aria-hidden='true'
                />
                {capture.action.confirmedLabel}
              </p>
            </div>
          </article>

          <div className='flex items-center justify-center' aria-hidden='true'>
            <ArrowRight className='h-5 w-5 rotate-90 text-tertiary-token lg:rotate-0' />
          </div>

          <article className='flex min-h-64 flex-col justify-between rounded-2xl border border-subtle bg-surface-1 p-5 sm:p-6'>
            <div>
              <p className='text-xs font-semibold text-secondary-token'>
                {capture.journey.notificationEyebrow}
              </p>
              <h3 className='mt-3 text-2xl font-semibold tracking-tight text-primary-token'>
                {capture.journey.notificationHeadline}
              </h3>
              <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                {capture.journey.notificationBody}
              </p>
            </div>

            <div className='mt-8 rounded-xl border border-subtle bg-surface-0 p-4'>
              <div className='flex items-start gap-3'>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-token text-surface-1'>
                  <BellRing className='h-4 w-4' aria-hidden='true' />
                </span>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2 text-2xs text-tertiary-token'>
                    <span className='font-semibold text-secondary-token'>
                      {capture.notification.appName}
                    </span>
                    <span>{capture.notification.timeLabel}</span>
                  </div>
                  <p className='mt-2 text-sm font-semibold text-primary-token'>
                    {capture.notification.title}
                  </p>
                  <p className='mt-1.5 text-xs leading-relaxed text-secondary-token'>
                    {capture.notification.detail}
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>

        <ol className='mt-8 grid gap-3 md:grid-cols-3'>
          {capture.benefits.map((benefit, index) => (
            <li key={benefit.id} className='border-t border-subtle pt-4'>
              <p className='font-mono text-3xs text-tertiary-token'>
                0{index + 1}
              </p>
              <p className='mt-3 text-sm font-semibold text-primary-token'>
                {benefit.label}
              </p>
              <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                {benefit.detail}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </ArtistProfileSectionShell>
  );
}
