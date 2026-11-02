import { cn } from '@/lib/utils';

interface ContainerProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  /** `bleed` is the one full-bleed override. Every other width is the box. */
  readonly size?: 'page' | 'bleed';
}

/**
 * Public container. One boxed width (`.public-container`, the
 * `--ds-public-content-max` token with the shared gutter) and one full-bleed
 * override. There are no other sizes.
 */
export function Container({
  children,
  className,
  size = 'page',
}: ContainerProps) {
  return (
    <div
      className={cn(
        'public-container',
        size === 'bleed' && 'public-container--bleed',
        className
      )}
    >
      {children}
    </div>
  );
}
