// @coverage-via apps/web/components/features/home/InputAuraFrame.test.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './InputAuraFrame.css';

export type InputAuraTreatment = 'default' | 'editorial';

interface InputAuraFrameProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly treatment?: InputAuraTreatment;
}

export function InputAuraFrame({
  children,
  className,
  treatment = 'default',
}: Readonly<InputAuraFrameProps>) {
  const isEditorial = treatment === 'editorial';

  return (
    <div
      className={cn(
        'input-aura-frame',
        isEditorial ? 'input-aura-frame--editorial' : 'group/aura',
        className
      )}
      data-aura-treatment={treatment}
    >
      <div
        aria-hidden='true'
        className={cn(
          'input-aura-frame__illumination',
          !isEditorial && [
            'pointer-events-none absolute -inset-1.5 overflow-hidden rounded-xl opacity-40 blur-[5px]',
            'transition-opacity duration-cinematic group-focus-within/aura:opacity-100',
            "before:absolute before:left-1/2 before:top-1/2 before:h-150 before:w-150 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[82deg] before:content-['']",
            'before:bg-[conic-gradient(transparent,var(--color-accent-purple),transparent_10%,transparent_50%,var(--color-accent-pink),transparent_60%)]',
            'before:transition-transform before:duration-[4000ms] before:ease-out',
            'group-focus-within/aura:before:rotate-[442deg]',
            'motion-reduce:before:transition-none motion-reduce:group-focus-within/aura:before:rotate-[82deg]',
          ]
        )}
      />
      {children}
    </div>
  );
}
