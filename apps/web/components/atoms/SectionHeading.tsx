import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  id?: string;
}

export function SectionHeading({
  level = 2,
  children,
  className = '',
  align = 'center',
  size = 'lg',
  id,
}: SectionHeadingProps) {
  const Tag = `h${level}` as ElementType;

  // Normalized type scale following 4/8pt grid system
  const sizeClasses = {
    sm: 'text-lg md:text-xl leading-7 md:leading-8',
    md: 'text-xl md:text-2xl leading-8 md:leading-9',
    lg: 'text-2xl md:text-3xl leading-9 md:leading-10',
    xl: 'text-3xl md:text-4xl sm:text-5xl leading-10 md:leading-[3rem]',
  };

  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <Tag
      id={id}
      className={cn(
        'font-bold tracking-tight text-gray-900 dark:text-white',
        sizeClasses[size],
        alignClasses[align],
        className
      )}
      style={{ letterSpacing: '-0.02em' }}
    >
      {children}
    </Tag>
  );
}
