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

const BASE_PILL_CLASSNAME =
  'inline-flex min-h-[28px] items-center gap-1.5 rounded-[9px] border px-2.5 py-1 text-[12px] font-[510] tracking-[-0.01em] shadow-none transition-[background-color,border-color,color,box-shadow] duration-150';

const INTERACTIVE_PILL_CLASSNAME =
  'focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 disabled:opacity-50 disabled:cursor-not-allowed';

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
          BASE_PILL_CLASSNAME,
          'text-(--linear-text-secondary)',
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
              BASE_PILL_CLASSNAME,
              INTERACTIVE_PILL_CLASSNAME,
              'cursor-pointer text-(--linear-text-secondary)',
              className
            )}
            style={
              {
                borderColor: `${accent}30`,
                backgroundColor: `${accent}10`,
              } satisfies React.CSSProperties
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
        BASE_PILL_CLASSNAME,
        INTERACTIVE_PILL_CLASSNAME,
        'border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)',
        className
      )}
      aria-label={`Connect ${label}`}
    >
      <DspProviderIcon provider={provider} size='sm' className='gap-0' />
      <span>Not Connected</span>
      <Plus className='h-4 w-4 shrink-0' />
    </button>
  );
}
