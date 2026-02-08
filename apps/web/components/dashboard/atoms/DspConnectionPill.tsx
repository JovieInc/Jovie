'use client';

import { CheckCircle2, Plus } from 'lucide-react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';

const PROVIDER_STYLES = {
  spotify: {
    accent: '#1DB954',
    label: 'Spotify',
    platform: 'spotify',
  },
  apple_music: {
    accent: '#FA243C',
    label: 'Apple Music',
    platform: 'apple_music',
  },
} as const;

type DspProvider = keyof typeof PROVIDER_STYLES;

interface DspConnectionPillProps {
  readonly provider: DspProvider;
  readonly connected: boolean;
  readonly artistName?: string | null;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function DspConnectionPill({
  provider,
  connected,
  artistName,
  onClick,
  disabled,
  className,
}: DspConnectionPillProps) {
  const style = PROVIDER_STYLES[provider];

  if (connected) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-xs font-medium transition-colors',
          className
        )}
        style={{
          borderColor: `${style.accent}30`,
          backgroundColor: `${style.accent}10`,
          color: style.accent,
        }}
      >
        <SocialIcon platform={style.platform} className='h-3 w-3' />
        <span className='truncate max-w-[120px]'>
          {artistName || 'Connected'}
        </span>
        <CheckCircle2 className='h-3 w-3 shrink-0' />
      </span>
    );
  }

  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-1 py-1 pl-2.5 pr-3 text-xs font-medium text-secondary-token transition-colors',
        'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      style={
        {
          '--tw-ring-color': `${style.accent}50`,
        } as React.CSSProperties
      }
    >
      <SocialIcon platform={style.platform} className='h-3 w-3' />
      <span>Not Connected</span>
      <Plus className='h-3 w-3 shrink-0' />
    </button>
  );
}
