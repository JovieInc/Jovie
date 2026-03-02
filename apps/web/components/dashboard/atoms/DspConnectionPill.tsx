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
import { type DspProviderId } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';
import {
  DspProviderIcon,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
} from './DspProviderIcon';

const CONNECTION_PILL_PROVIDERS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'tidal',
  'deezer',
  'amazon_music',
] as const satisfies ReadonlyArray<DspProviderId>;

type DspProvider = (typeof CONNECTION_PILL_PROVIDERS)[number];

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
  const accent = PROVIDER_COLORS[provider];
  const label = PROVIDER_LABELS[provider];
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
          borderColor: `${accent}30`,
          backgroundColor: `${accent}10`,
        }}
      >
        <DspProviderIcon provider={provider} size='sm' className='gap-0' />
        <span className='truncate max-w-[120px] text-secondary-token'>
          {artistName || 'Connected'}
        </span>
        <CheckCircle2 className='h-4 w-4 shrink-0' style={{ color: accent }} />
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
                borderColor: `${accent}30`,
                backgroundColor: `${accent}10`,
                '--tw-ring-color': `${accent}50`,
              } as React.CSSProperties
            }
            aria-label={`${label} connection: ${artistName || 'Connected'}`}
          >
            <DspProviderIcon provider={provider} size='sm' className='gap-0' />
            <span className='truncate max-w-[120px] text-secondary-token'>
              {artistName || 'Connected'}
            </span>
            {hovered || menuOpen ? (
              <MoreHorizontal
                className='h-4 w-4 shrink-0'
                style={{ color: accent }}
              />
            ) : (
              <CheckCircle2
                className='h-4 w-4 shrink-0'
                style={{ color: accent }}
              />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' sideOffset={4}>
          {onSyncNow && (
            <DropdownMenuItem onClick={onSyncNow}>
              <RefreshCw className='h-3.5 w-3.5' />
              Sync
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
          '--tw-ring-color': `${accent}50`,
        } as React.CSSProperties
      }
      aria-label={`Connect ${label}`}
    >
      <DspProviderIcon provider={provider} size='sm' className='gap-0' />
      <span>Not Connected</span>
      <Plus className='h-4 w-4 shrink-0' />
    </button>
  );
}
