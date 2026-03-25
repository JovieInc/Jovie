'use client';

import { Check, Copy, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useReleasePitchMutation } from '@/lib/queries/useReleasePitchMutation';
import { type GeneratedPitches, PLATFORM_LIMITS } from '@/lib/services/pitch';
import { cn } from '@/lib/utils';

const PLATFORM_CONFIG = [
  { key: 'spotify' as const, label: 'Spotify', limit: PLATFORM_LIMITS.spotify },
  {
    key: 'appleMusic' as const,
    label: 'Apple Music',
    limit: PLATFORM_LIMITS.appleMusic,
  },
  {
    key: 'amazon' as const,
    label: 'Amazon Music',
    limit: PLATFORM_LIMITS.amazon,
  },
  { key: 'generic' as const, label: 'Generic', limit: PLATFORM_LIMITS.generic },
] as const;

interface ReleasePitchSectionProps {
  readonly releaseId: string;
  readonly existingPitches?: GeneratedPitches | null;
  readonly onPitchesGenerated?: (pitches: GeneratedPitches) => void;
}

function CopyButton({ text, platform }: { text: string; platform: string }) {
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

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-1.5'>
          <Sparkles className='h-3.5 w-3.5 text-tertiary-token' />
          <span className='text-[11px] font-medium text-secondary-token'>
            Playlist Pitches
          </span>
        </div>
        <button
          type='button'
          onClick={handleGenerate}
          disabled={isPending}
          className={cn(
            'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            'bg-accent-token/10 text-accent-token hover:bg-accent-token/20',
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

      {isPending && (
        <div className='space-y-2'>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className='animate-pulse rounded-lg bg-surface-1 p-3'>
              <div className='mb-2 h-3 w-20 rounded bg-surface-2' />
              <div className='space-y-1.5'>
                <div className='h-2.5 w-full rounded bg-surface-2' />
                <div className='h-2.5 w-3/4 rounded bg-surface-2' />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isPending && pitches && (
        <div className='space-y-2'>
          {PLATFORM_CONFIG.map(({ key, label, limit }) => {
            const text = pitches[key];
            if (!text) return null;
            return (
              <div
                key={key}
                className='rounded-lg border border-subtle bg-surface-1 p-2.5'
              >
                <div className='mb-1.5 flex items-center justify-between'>
                  <span className='text-[11px] font-medium text-secondary-token'>
                    {label}
                  </span>
                  <div className='flex items-center gap-1.5'>
                    <span
                      className={cn(
                        'text-[10px] tabular-nums',
                        text.length > limit
                          ? 'text-red-500'
                          : 'text-tertiary-token'
                      )}
                    >
                      {text.length}/{limit}
                    </span>
                    <CopyButton text={text} platform={label} />
                  </div>
                </div>
                <p className='text-[12px] leading-relaxed text-primary-token'>
                  {text}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!isPending && !pitches && (
        <p className='py-3 text-center text-[12px] text-tertiary-token'>
          Generate AI-powered playlist pitches formatted for each streaming
          platform.
        </p>
      )}
    </div>
  );
}
