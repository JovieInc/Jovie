import { cn } from '@/lib/utils';

export interface MarketingSectionHeadingProps {
  readonly id: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/** Canonical section-level type primitive for acquisition pages. */
export function MarketingSectionHeading({
  id,
  children,
  className,
}: Readonly<MarketingSectionHeadingProps>) {
  return (
    <h2
      id={id}
      className={cn(
        'system-b-marketing-section-heading text-primary-token',
        className
      )}
    >
      {children}
    </h2>
  );
}
