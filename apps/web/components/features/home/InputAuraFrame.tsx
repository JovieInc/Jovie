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
    <div className={cn('group/aura relative', className)}>
      <div
        aria-hidden='true'
        className={cn(
          'pointer-events-none absolute -inset-[6px] overflow-hidden rounded-[1rem] opacity-40 blur-[5px]',
          'transition-opacity duration-500 group-focus-within/aura:opacity-100',
          "before:absolute before:left-1/2 before:top-1/2 before:h-[600px] before:w-[600px] before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[82deg] before:content-['']",
          'before:bg-[conic-gradient(transparent,var(--color-accent-purple),transparent_10%,transparent_50%,var(--color-accent-pink),transparent_60%)]',
          'before:transition-transform before:duration-[4000ms] before:ease-out',
          'group-focus-within/aura:before:rotate-[442deg]',
          'motion-reduce:before:transition-none motion-reduce:group-focus-within/aura:before:rotate-[82deg]'
        )}
      />
      {children}
    </div>
  );
}
