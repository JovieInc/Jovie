'use client';

import { Check, Copy, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PLATFORM_LIMITS } from '@/lib/services/pitch/types';
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
  {
    key: 'generic' as const,
    label: 'General',
    limit: PLATFORM_LIMITS.generic,
  },
] as const;

interface PitchResult {
  readonly spotify: string;
  readonly appleMusic: string;
  readonly amazon: string;
  readonly generic: string;
}

interface ChatPitchCardProps {
  readonly state: 'loading' | 'success' | 'error';
  readonly releaseTitle?: string;
  readonly pitches?: PitchResult;
  readonly error?: string;
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

function PitchBlock({
  label,
  text,
  limit,
}: Readonly<{ label: string; text: string; limit: number }>) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 180;

  return (
    <div className='rounded-lg border border-subtle bg-surface-1 p-2.5'>
      <div className='mb-1.5 flex items-center justify-between'>
        <span className='text-2xs font-medium text-secondary-token'>
          {label}
        </span>
        <div className='flex items-center gap-1.5'>
          <span
            className={cn(
              'text-[10px] tabular-nums',
              text.length > limit ? 'text-red-500' : 'text-tertiary-token'
            )}
          >
            {text.length}/{limit}
          </span>
          <CopyButton text={text} platform={label} />
        </div>
      </div>
      <p
        className={cn(
          'text-xs leading-relaxed text-primary-token',
          !expanded && isLong && 'line-clamp-3'
        )}
      >
        {text}
      </p>
      {isLong && (
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='mt-1 text-2xs font-medium text-accent-token hover:underline'
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export function ChatPitchCard({
  state,
  releaseTitle,
  pitches,
  error,
}: ChatPitchCardProps) {
  if (state === 'loading') {
    return (
      <div className='mt-3 rounded-[20px] border border-(--linear-app-frame-seam) bg-surface-0 p-4'>
        <div className='mb-3 flex items-center gap-2'>
          <Sparkles className='h-4 w-4 animate-pulse text-accent-token' />
          <span className='text-app font-medium text-secondary-token'>
            Generating pitches…
          </span>
        </div>
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
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className='mt-3 rounded-[20px] border border-red-500/20 bg-surface-0 p-4'>
        <div className='flex items-center gap-2'>
          <Sparkles className='h-4 w-4 text-red-500' />
          <span className='text-app font-medium text-red-500'>
            Pitch generation failed
          </span>
        </div>
        {error && (
          <p className='mt-1.5 text-xs text-secondary-token'>{error}</p>
        )}
      </div>
    );
  }

  if (!pitches) return null;

  return (
    <div className='mt-3 rounded-[20px] border border-(--linear-app-frame-seam) bg-surface-0 p-4'>
      <div className='mb-3 flex items-center gap-2'>
        <Sparkles className='h-4 w-4 text-accent-token' />
        <span className='text-app font-medium text-secondary-token'>
          Pitch Builder{releaseTitle ? ` — ${releaseTitle}` : ''}
        </span>
      </div>
      <div className='space-y-2'>
        {PLATFORM_CONFIG.map(({ key, label, limit }) => {
          const text = pitches[key];
          if (!text) return null;
          return (
            <PitchBlock key={key} label={label} text={text} limit={limit} />
          );
        })}
      </div>
    </div>
  );
}
