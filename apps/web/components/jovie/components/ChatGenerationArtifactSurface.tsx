'use client';

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const CHAT_GENERATION_SHIMMER_BG =
  'linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.04) 35%, rgba(103,232,249,0.06) 50%, rgba(255,255,255,0.04) 65%, transparent 100%)';

interface ChatGenerationArtifactSurfaceProps {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly children: ReactNode;
  readonly className?: string;
}

export function ChatGenerationArtifactSurface({
  title,
  subtitle,
  children,
  className,
}: ChatGenerationArtifactSurfaceProps) {
  return (
    <section
      data-testid='chat-generation-artifact-surface'
      className={cn(
        'w-full max-w-[520px] overflow-hidden rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40',
        className
      )}
    >
      <div className='flex h-9 items-center gap-2 border-b border-(--linear-app-shell-border)/60 px-3'>
        <Sparkles className='h-3.5 w-3.5 text-cyan-300/80' strokeWidth={2.25} />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[12px] font-medium text-secondary-token'>
            {title}
          </p>
          {subtitle ? (
            <p className='truncate text-[11px] text-tertiary-token'>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className='p-3'>{children}</div>
    </section>
  );
}
