'use client';

import { Bot, Loader2, Sparkles } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useAppActivityStatus } from './useAppActivityStatus';

const TONE_CLASSNAME = {
  idle: 'border-subtle bg-surface-1 text-secondary-token',
  working:
    'border-[color-mix(in_oklab,var(--linear-accent)_24%,transparent)] bg-[color-mix(in_oklab,var(--linear-accent)_10%,var(--linear-app-content-surface))] text-primary-token',
  attention:
    'border-[color-mix(in_oklab,var(--linear-warning)_28%,transparent)] bg-[color-mix(in_oklab,var(--linear-warning)_12%,var(--linear-app-content-surface))] text-primary-token',
} as const;

function HeaderActivityIcon({
  tone,
}: Readonly<{ tone: 'idle' | 'working' | 'attention' }>) {
  if (tone === 'working') {
    return (
      <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
    );
  }
  if (tone === 'attention') {
    return <Sparkles className='h-3.5 w-3.5' />;
  }
  return <Bot className='h-3.5 w-3.5' />;
}

export const HeaderActivityIndicator = memo(function HeaderActivityIndicator() {
  const status = useAppActivityStatus();

  if (!status) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex h-8 max-w-[13.5rem] items-center gap-2 rounded-full border px-2.5 text-[11px] font-[560] tracking-[-0.01em] shadow-none',
        TONE_CLASSNAME[status.tone]
      )}
      role='status'
      title={status.detail ?? status.label}
      aria-label={status.detail ?? status.label}
    >
      <HeaderActivityIcon tone={status.tone} />
      <span className='min-w-0 truncate'>{status.label}</span>
      {typeof status.count === 'number' && status.count > 1 ? (
        <span className='shrink-0 rounded-full bg-black/6 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-white/8'>
          {status.count}
        </span>
      ) : null}
    </div>
  );
});
