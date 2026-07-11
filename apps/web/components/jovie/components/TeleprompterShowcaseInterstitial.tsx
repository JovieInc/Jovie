'use client';

import { Button } from '@jovie/ui';
import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { TeleprompterNotchVisual } from '@/components/jovie/components/TeleprompterNotchVisual';
import { trackTeleprompterFunnel } from '@/lib/teleprompter/analytics';
import type {
  RecordableVideoKind,
  TeleprompterShowcaseVariant,
} from '@/lib/teleprompter/types';
import { cn } from '@/lib/utils';

export interface TeleprompterShowcaseInterstitialProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly profileId: string;
  readonly kind: RecordableVideoKind;
  readonly title: string;
  readonly script: string;
  readonly showcaseVariant: TeleprompterShowcaseVariant;
  readonly onStartRecording: () => void;
}

const SHOWCASE_GRADIENT_STYLE: CSSProperties = {
  background:
    'radial-gradient(120% 100% at 50% -8%, color-mix(in oklab, var(--color-accent-blue) 36%, #101020) 0%, #0a0a12 58%)',
};

export function TeleprompterShowcaseInterstitial({
  open,
  onOpenChange,
  profileId,
  kind,
  title,
  script,
  showcaseVariant,
  onStartRecording,
}: TeleprompterShowcaseInterstitialProps) {
  const trackedImpressionRef = useRef(false);

  useEffect(() => {
    if (!open || trackedImpressionRef.current) return;
    trackedImpressionRef.current = true;
    trackTeleprompterFunnel('teleprompter_showcase_impression', {
      profileId,
      kind,
      showcaseVariant,
      title,
    });
  }, [open, profileId, kind, showcaseVariant, title]);

  if (!open) return null;

  const handleDismiss = () => {
    trackTeleprompterFunnel('teleprompter_showcase_dismissed', {
      profileId,
      kind,
      showcaseVariant,
      title,
    });
    onOpenChange(false);
  };

  const handleStart = () => {
    onStartRecording();
    onOpenChange(false);
  };

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
      data-testid='teleprompter-showcase-interstitial'
    >
      <button
        type='button'
        aria-label='Dismiss Teleprompter Preview'
        className='absolute inset-0 bg-black/55 backdrop-blur-sm'
        onClick={handleDismiss}
      />
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='teleprompter-showcase-title'
        className={cn(
          'relative z-10',
          'relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/12',
          'p-6 text-white shadow-[0_28px_80px_rgba(0,0,0,0.5)] dark:text-white sm:p-8'
        )}
        style={SHOWCASE_GRADIENT_STYLE}
      >
        <button
          type='button'
          onClick={handleDismiss}
          className='absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-white/8 text-white/80 transition-colors hover:bg-white/14 dark:text-white/80'
          aria-label='Dismiss Teleprompter Preview'
        >
          <X className='h-4 w-4' aria-hidden='true' />
        </button>

        <div className='grid gap-6 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center'>
          <div className='min-w-0'>
            <p className='text-2xs font-medium text-white/65 dark:text-white/65'>
              {title}
            </p>
            <h2
              id='teleprompter-showcase-title'
              className='mt-2 text-xl font-semibold tracking-tighter text-white dark:text-white'
            >
              {'Record With A Voice Following Teleprompter'}
            </h2>
            <p className='mt-2 max-w-[34ch] text-sm leading-5 text-white/72 dark:text-white/72'>
              Jovie scrolls your script in real time as you speak, so you keep
              eye contact with the camera.
            </p>
            <div className='mt-6 flex flex-wrap gap-3'>
              <Button
                type='button'
                size='sm'
                className='bg-white text-black hover:bg-white/92 dark:bg-white dark:text-black dark:hover:bg-white/92'
                onClick={handleStart}
                data-testid='teleprompter-showcase-start'
              >
                Start Recording
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='border-white/20 bg-transparent text-white hover:bg-white/10 dark:text-white'
                onClick={handleDismiss}
              >
                Not Now
              </Button>
            </div>
          </div>
          <TeleprompterNotchVisual script={script} />
        </div>
      </div>
    </div>
  );
}
