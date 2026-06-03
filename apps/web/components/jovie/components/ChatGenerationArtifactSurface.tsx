'use client';

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
      className={cn('system-b-chat-generation-artifact-surface', className)}
    >
      <div className='system-b-chat-generation-artifact-header flex h-9 items-center gap-2 px-3'>
        <Sparkles
          className='system-b-chat-generation-artifact-icon h-3.5 w-3.5'
          strokeWidth={2.25}
        />
        <div className='min-w-0 flex-1'>
          <p className='system-b-chat-generation-artifact-title'>{title}</p>
          {subtitle ? (
            <p className='system-b-chat-generation-artifact-subtitle'>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className='p-3'>{children}</div>
    </section>
  );
}
