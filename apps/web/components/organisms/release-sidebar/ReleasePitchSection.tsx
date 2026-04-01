'use client';

import { Check, Copy, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { useReleasePitchMutation } from '@/lib/queries/useReleasePitchMutation';
import {
  type GeneratedPitches,
  PLATFORM_LIMITS,
  type PlatformKey,
} from '@/lib/services/pitch/types';
import { cn } from '@/lib/utils';

const PLATFORM_CONFIG = [
  {
    key: 'spotify' as const,
    label: 'Spotify',
    shortLabel: 'Spotify',
    limit: PLATFORM_LIMITS.spotify,
  },
  {
    key: 'appleMusic' as const,
    label: 'Apple Music',
    shortLabel: 'Apple',
    limit: PLATFORM_LIMITS.appleMusic,
  },
  {
    key: 'amazon' as const,
    label: 'Amazon Music',
    shortLabel: 'Amazon',
    limit: PLATFORM_LIMITS.amazon,
  },
  {
    key: 'generic' as const,
    label: 'Generic',
    shortLabel: 'Generic',
    limit: PLATFORM_LIMITS.generic,
  },
] as const;

interface ReleasePitchSectionProps {
  readonly releaseId: string;
  readonly existingPitches?: GeneratedPitches | null;
  readonly onPitchesGenerated?: (pitches: GeneratedPitches) => void;
}

function CopyButton({
  text,
  platform,
}: Readonly<{ text: string; platform: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        toast.success(`${platform} pitch copied`);
      })
      .catch(() => {
        toast.error('Failed to copy');
      });
  }, [text, platform]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type='button'
      onClick={handleCopy}
      className='shrink-0 rounded-md p-1 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token'
      aria-label={`Copy ${platform} pitch`}
    >
      {copied ? (
        <Check className='h-3.5 w-3.5 text-green-500' />
      ) : (
        <Copy className='h-3.5 w-3.5' />
      )}
    </button>
  );
}

export function ReleasePitchSection({
  releaseId,
  existingPitches,
  onPitchesGenerated,
}: ReleasePitchSectionProps) {
  const [pitches, setPitches] = useState<GeneratedPitches | null>(
    existingPitches ?? null
  );
  const [selectedPlatform, setSelectedPlatform] =
    useState<PlatformKey>('spotify');
  const tabsRef = useRef<HTMLDivElement>(null);

  // Sync with external data
  useEffect(() => {
    if (existingPitches) setPitches(existingPitches);
  }, [existingPitches]);

  const { mutate, isPending } = useReleasePitchMutation();

  const handleGenerate = useCallback(() => {
    mutate(releaseId, {
      onSuccess: data => {
        setPitches(data);
        onPitchesGenerated?.(data);
        toast.success('Pitches generated');
      },
      onError: error => {
        toast.error(error.message || 'Failed to generate pitches');
      },
    });
  }, [releaseId, mutate, onPitchesGenerated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const keys = PLATFORM_CONFIG.map(p => p.key);
      const currentIndex = keys.indexOf(selectedPlatform);
      let nextIndex: number;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % keys.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + keys.length) % keys.length;
      } else {
        return;
      }

      setSelectedPlatform(keys[nextIndex]);
      const tabs = tabsRef.current?.querySelectorAll('[role="tab"]');
      (tabs?.[nextIndex] as HTMLElement)?.focus();
    },
    [selectedPlatform]
  );

  const activeConfig = PLATFORM_CONFIG.find(p => p.key === selectedPlatform)!;
  const activeText = pitches?.[selectedPlatform] ?? '';
  const tabId = `pitch-tab-${selectedPlatform}`;
  const panelId = `pitch-panel-${selectedPlatform}`;

  return (
    <DrawerSurfaceCard
      className={cn(LINEAR_SURFACE.drawerCardSm, 'space-y-2.5 border-0 p-3')}
      testId='release-pitch-card'
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
          <Sparkles className='h-3.5 w-3.5 text-tertiary-token' />
          <span className='text-[11px] font-medium text-secondary-token'>
            Playlist Pitches
          </span>
        </div>
        {pitches && activeText && (
          <CopyButton text={activeText} platform={activeConfig.label} />
        )}
      </div>

      <div className='relative min-h-[80px] rounded-xl border border-(--linear-app-frame-seam) bg-surface-0 p-2.5'>
        {isPending && (
          <div className='animate-pulse space-y-1.5'>
            <div className='h-2.5 w-full rounded bg-surface-2' />
            <div className='h-2.5 w-4/5 rounded bg-surface-2' />
            <div className='h-2.5 w-3/5 rounded bg-surface-2' />
          </div>
        )}

        {!isPending && pitches && (
          <div
            id={panelId}
            role='tabpanel'
            aria-labelledby={tabId}
            className='transition-opacity duration-150'
          >
            {activeText ? (
              <p className='pr-12 text-[12px] leading-relaxed text-primary-token'>
                {activeText}
              </p>
            ) : (
              <p className='py-2 text-center text-[11px] text-tertiary-token'>
                No pitch generated for this platform
              </p>
            )}
          </div>
        )}

        {!isPending && !pitches && (
          <p className='py-2 text-center text-[11px] text-tertiary-token'>
            Generate AI-powered playlist pitches formatted for each streaming
            platform.
          </p>
        )}

        {/* Character count */}
        {!isPending && pitches && activeText && (
          <span
            className={cn(
              'absolute bottom-2 right-2.5 text-[10px] tabular-nums',
              activeText.length > activeConfig.limit
                ? 'text-red-500'
                : 'text-tertiary-token'
            )}
          >
            {activeText.length}/{activeConfig.limit}
          </span>
        )}
      </div>

      <div className='flex items-center justify-between'>
        <div
          ref={tabsRef}
          role='tablist'
          tabIndex={0}
          aria-label='Platform pitches'
          className='flex flex-wrap items-center gap-1'
          onKeyDown={handleKeyDown}
        >
          {PLATFORM_CONFIG.map(({ key, label, shortLabel }) => (
            <button
              key={key}
              type='button'
              role='tab'
              id={`pitch-tab-${key}`}
              aria-selected={selectedPlatform === key}
              aria-controls={`pitch-panel-${key}`}
              tabIndex={selectedPlatform === key ? 0 : -1}
              onClick={() => setSelectedPlatform(key)}
              className={cn(
                'inline-flex min-h-6 items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-[background-color,border-color,color] duration-150',
                selectedPlatform === key
                  ? 'border-default bg-surface-0 text-primary-token'
                  : 'border-(--linear-app-frame-seam) bg-transparent text-tertiary-token hover:border-default hover:bg-surface-0 hover:text-secondary-token'
              )}
            >
              {shortLabel}
            </button>
          ))}
        </div>

        <button
          type='button'
          onClick={handleGenerate}
          disabled={isPending}
          className={cn(
            'inline-flex min-h-6 items-center justify-center rounded-full border border-(--linear-app-frame-seam) px-2.5 py-0.5 text-[10px] font-medium text-secondary-token transition-[background-color,border-color,color] duration-150 hover:border-default hover:bg-surface-0 hover:text-primary-token',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {(() => {
            if (isPending) return 'Generating…';
            if (pitches) return 'Regenerate';
            return 'Generate Pitch';
          })()}
        </button>
      </div>
    </DrawerSurfaceCard>
  );
}
