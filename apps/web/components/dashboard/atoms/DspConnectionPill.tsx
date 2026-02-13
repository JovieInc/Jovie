'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  CheckCircle2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Unlink,
} from 'lucide-react';
import { useState } from 'react';
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
    platform: 'applemusic',
  },
  youtube_music: {
    accent: '#FF0000',
    label: 'YouTube Music',
    platform: 'youtube_music',
  },
  soundcloud: {
    accent: '#FF5500',
    label: 'SoundCloud',
    platform: 'soundcloud',
  },
  tidal: {
    accent: '#000000',
    label: 'Tidal',
    platform: 'tidal',
  },
} as const;

type DspProvider = keyof typeof PROVIDER_STYLES;

interface DspConnectionPillProps {
  readonly provider: DspProvider;
  readonly connected: boolean;
  readonly artistName?: string | null;
  readonly onClick?: () => void;
  readonly onSyncNow?: () => void;
  readonly onDisconnect?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function DspConnectionPill({
  provider,
  connected,
  artistName,
  onClick,
  onSyncNow,
  onDisconnect,
  disabled,
  className,
}: DspConnectionPillProps) {
  const style = PROVIDER_STYLES[provider];
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasActions = onSyncNow || onDisconnect;

  if (connected && !hasActions) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-xs font-medium',
          className
        )}
        style={{
          borderColor: `${style.accent}30`,
          backgroundColor: `${style.accent}10`,
          color: style.accent,
        }}
      >
        <SocialIcon platform={style.platform} className='h-4 w-4' />
        <span className='truncate max-w-[120px]'>
          {artistName || 'Connected'}
        </span>
        <CheckCircle2 className='h-4 w-4 shrink-0' />
      </span>
    );
  }

  if (connected) {
    return (
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            disabled={disabled}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-3 text-xs font-medium transition-colors cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              className
            )}
            style={
              {
                borderColor: `${style.accent}30`,
                backgroundColor: `${style.accent}10`,
                color: style.accent,
                '--tw-ring-color': `${style.accent}50`,
              } as React.CSSProperties
            }
          >
            <SocialIcon platform={style.platform} className='h-4 w-4' />
            <span className='truncate max-w-[120px]'>
              {artistName || 'Connected'}
            </span>
            {hovered || menuOpen ? (
              <MoreHorizontal className='h-4 w-4 shrink-0' />
            ) : (
              <CheckCircle2 className='h-4 w-4 shrink-0' />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' sideOffset={4}>
          {onSyncNow && (
            <DropdownMenuItem onClick={onSyncNow}>
              <RefreshCw className='h-4 w-4' />
              Sync Now
            </DropdownMenuItem>
          )}
          {onSyncNow && onDisconnect && <DropdownMenuSeparator />}
          {onDisconnect && (
            <DropdownMenuItem variant='destructive' onClick={onDisconnect}>
              <Unlink className='h-4 w-4' />
              Disconnect
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
      <SocialIcon platform={style.platform} className='h-4 w-4' />
      <span>Not Connected</span>
      <Plus className='h-4 w-4 shrink-0' />
    </button>
  );
}
