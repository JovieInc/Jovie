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
  return 'journey' in capture;
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
      <div className='ap-capture-loop__layout mx-auto grid max-w-public-content items-center gap-12 lg:grid-cols-[minmax(0,0.58fr)_minmax(34rem,1.42fr)] lg:gap-16'>
        <div className='ap-capture-loop__copy'>
          <ArtistProfileSectionHeader
            align='left'
            headline={capture.headline}
            body={capture.body}
            className='max-w-xl'
            bodyClassName='max-w-lg'
          />
        </div>

        <figure
          className='ap-capture-loop__visual relative'
          data-testid='artist-profile-capture-demo'
        >
          <figcaption className='sr-only'>
            A focused Jovie fan opt-in accepts an email, confirms the fan, and
            turns that moment into an audience the artist can reach again.
          </figcaption>
          <ArtistProfileCaptureVisual
            capture={capture}
            className='ap-capture-loop__proof'
          />
        </figure>
      </div>
    </ArtistProfileSectionShell>
  );
}
