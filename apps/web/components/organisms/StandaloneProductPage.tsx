import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WIDTH_CLASSNAME = {
  sm: 'max-w-xl',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
} as const;

export interface StandaloneProductPageProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly width?: keyof typeof WIDTH_CLASSNAME;
  readonly centered?: boolean;
}

export function StandaloneProductPage({
  children,
  className,
  contentClassName,
  width = 'lg',
  centered = false,
}: Readonly<StandaloneProductPageProps>) {
  return (
    <main
      className={cn(
        'min-h-svh overflow-y-auto bg-page px-4 py-8 text-primary-token sm:px-6 sm:py-10',
        centered && 'flex items-center justify-center',
        className
      )}
    >
      <div
        className={cn(
          'mx-auto w-full',
          WIDTH_CLASSNAME[width],
          contentClassName
        )}
      >
        {children}
      </div>
    </main>
  );
}
