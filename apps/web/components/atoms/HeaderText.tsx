'use client';

import { cn } from '@/lib/utils';

type HeaderTextTone = 'primary' | 'secondary';

const toneClasses: Record<HeaderTextTone, string> = {
  primary: 'text-primary-token',
  secondary: 'text-secondary-token',
};

export function headerTextClass({
  tone = 'primary',
  className,
}: {
  tone?: HeaderTextTone;
  className?: string;
}) {
  return cn(
    'text-[14px] font-medium leading-5 tracking-[-0.01em]',
    toneClasses[tone],
    className
  );
}
