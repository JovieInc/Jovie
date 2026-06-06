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
      <div className='system-b-chat-generation-artifact-header'>
        <Sparkles
          className='system-b-chat-generation-artifact-icon'
          strokeWidth={2.25}
        />
        <div className='system-b-chat-generation-artifact-copy'>
          <p className='system-b-chat-generation-artifact-title'>{title}</p>
          {subtitle ? (
            <p className='system-b-chat-generation-artifact-subtitle'>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className='system-b-chat-generation-artifact-body'>{children}</div>
    </section>
  );
}
