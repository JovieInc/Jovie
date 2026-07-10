'use client';

import type { ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

/**
 * Canonical dismiss copy for chat confirm/tool cards (JOV-3551).
 * All confirm cards share this verb — no "Link dismissed" / "Removal cancelled" drift.
 */
export const CHAT_TOOL_CANCELLED_LABEL = 'Cancelled' as const;

export type ChatToolSurfaceTone = 'default' | 'success' | 'cancelled' | 'flat';

interface ChatToolSurfaceProps {
  readonly children: ReactNode;
  readonly tone?: ChatToolSurfaceTone;
  /** Extra classes layered onto the surface (e.g. system-b-chat-link-card). */
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * Single System B surface for chat tool/confirm result cards.
 * Replaces ad-hoc ContentSurfaceCard wrappers so success, cancel, and active
 * confirm states share tokens and elevation (no card-in-card when nested).
 */
export function ChatToolSurface({
  children,
  tone = 'default',
  className,
  'data-testid': testId,
}: ChatToolSurfaceProps) {
  if (tone === 'flat') {
    return (
      <div
        data-testid={testId ?? 'chat-tool-surface'}
        data-tone={tone}
        className={cn('system-b-chat-tool-surface-flat', className)}
      >
        {children}
      </div>
    );
  }

  return (
    <ContentSurfaceCard
      data-testid={testId ?? 'chat-tool-surface'}
      className={cn(
        'system-b-chat-tool-surface',
        tone === 'success' && 'system-b-chat-tool-surface-success',
        tone === 'cancelled' && 'system-b-chat-tool-surface-cancelled',
        className
      )}
    >
      {children}
    </ContentSurfaceCard>
  );
}
