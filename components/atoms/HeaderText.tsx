'use client';

import { cn } from '@/lib/utils';

type HeaderTextTone = 'primary' | 'secondary';

const toneClasses: Record<HeaderTextTone, string> = {
  primary: 'text-gray-900 dark:text-gray-50',
  secondary: 'text-gray-600 dark:text-gray-300',
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
