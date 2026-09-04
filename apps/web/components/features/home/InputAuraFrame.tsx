import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface InputAuraFrameProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function InputAuraFrame({
  children,
  className,
}: Readonly<InputAuraFrameProps>) {
  return (
    <div
      className={cn('group/aura relative isolate rounded-xl', className)}
      data-aura-contained='true'
      data-aura-motion='static'
    >
      <div
        aria-hidden='true'
        className={cn(
          'pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-100',
          "before:absolute before:inset-x-[8%] before:inset-y-[-90%] before:rounded-full before:bg-[linear-gradient(90deg,transparent_0%,var(--color-accent-purple)_34%,var(--color-accent-blue)_66%,transparent_100%)] before:opacity-50 before:blur-[14px] before:content-['']",
          "after:absolute after:inset-px after:rounded-[inherit] after:border after:border-white/[0.04] after:content-['']"
        )}
      />
      {children}
    </div>
  );
}
