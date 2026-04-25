'use client';

import type { ReactNode } from 'react';
import { PageShell } from '@/components/organisms/PageShell';

interface ChatWorkspaceSurfaceProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ChatWorkspaceSurface({
  children,
  className,
}: ChatWorkspaceSurfaceProps) {
  // The chat surface is the only app route where the input must stay visually
  // anchored at the bottom of the viewport — every other route just stacks
  // content top-down. The shared shell parent (AuthShellWrapper) wraps page
  // children in a `relative min-h-full` block, which means a flex-1 chain
  // alone cannot give the inner JovieChat a guaranteed full-height context;
  // the PageShell `<section>` collapses to its content, the composer floats
  // wherever the last DOM node lands, and any sibling appearing above the
  // input (rate-limit hint, ChatUsageAlert, ErrorDisplay, even a new chat
  // message) pushes the composer downward.
  //
  // Two changes give us a stable bottom anchor without touching shared shell
  // code:
  //   1. scroll='panel' on PageShell — the section becomes `min-h-0
  //      overflow-hidden flex-col`, so once we have a known height the
  //      flex-1 messages area + shrink-0 composer sandwich works.
  //   2. The wrapper below uses `absolute inset-0` to fill the nearest
  //      positioned ancestor (the shell's `relative min-h-full` wrapper),
  //      which guarantees a known viewport-relative height.
  return (
    <PageShell
      maxWidth='wide'
      frame='none'
      contentPadding='none'
      scroll='panel'
      className={className}
    >
      <div className='absolute inset-0 flex flex-col'>{children}</div>
    </PageShell>
  );
}
