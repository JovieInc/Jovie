'use client';

import { Button, IconButton } from '@jovie/ui';
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

// This showcase surface is intentionally always dark in both themes, so the
// canonical semantic token vars are scoped locally instead of using raw
// white/black palette utilities.
const SHOWCASE_SURFACE_STYLE: CSSProperties = {
  background:
    'radial-gradient(120% 100% at 50% -8%, color-mix(in oklab, var(--color-accent-blue) 36%, #101020) 0%, #0a0a12 58%)',
  boxShadow: '0 28px 80px rgba(0, 0, 0, 0.5)',
  '--color-text-primary-token': '#ffffff',
  '--color-text-secondary-token': 'rgba(255, 255, 255, 0.75)',
  '--color-text-tertiary-token': 'rgba(255, 255, 255, 0.65)',
  '--color-bg-surface-1': 'rgba(255, 255, 255, 0.08)',
  '--color-bg-surface-2': 'rgba(255, 255, 255, 0.14)',
  '--color-interactive-hover': 'rgba(255, 255, 255, 0.1)',
  '--color-border-subtle': 'rgba(255, 255, 255, 0.12)',
  '--color-border-focus': 'rgba(255, 255, 255, 0.55)',
  '--color-bg-page': '#0a0a12',
  '--color-btn-primary-bg': '#ffffff',
  '--color-btn-primary-fg': '#000000',
  '--color-btn-primary-hover': 'rgba(255, 255, 255, 0.92)',
} as CSSProperties;

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
          'w-full max-w-lg overflow-hidden rounded-3xl border border-subtle',
          'p-6 text-primary-token sm:p-8'
        )}
        style={SHOWCASE_SURFACE_STYLE}
      >
        <IconButton
          variant='ghost'
          size='md'
          onClick={handleDismiss}
          className='absolute right-4 top-4'
          ariaLabel='Dismiss Teleprompter Preview'
        >
          <X aria-hidden='true' />
        </IconButton>

        <div className='grid gap-6 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center'>
          <div className='min-w-0'>
            <p className='text-2xs font-medium text-tertiary-token'>{title}</p>
            <h2
              id='teleprompter-showcase-title'
              className='mt-2 text-xl font-semibold tracking-tighter'
            >
              {'Record With A Voice Following Teleprompter'}
            </h2>
            <p
              className='mt-2 text-sm leading-5 text-secondary-token'
              style={{ maxWidth: '34ch' }}
            >
              Jovie scrolls your script in real time as you speak, so you keep
              eye contact with the camera.
            </p>
            <div className='mt-6 flex flex-wrap gap-3'>
              <Button
                type='button'
                size='sm'
                onClick={handleStart}
                data-testid='teleprompter-showcase-start'
              >
                Start Recording
              </Button>
              <Button
                type='button'
                size='sm'
                variant='tertiary'
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
