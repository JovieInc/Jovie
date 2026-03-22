import { cn } from '@/lib/utils';

export interface MarketingHeroProps {
  readonly variant: 'split' | 'centered';
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Hero section layout primitive.
 *
 * - `centered`: single column, text centered, constrained to page width
 * - `split`: two-column grid on md+, text left / media right
 *
 * Both variants include generous vertical padding matching Linear hero spacing.
 */
export function MarketingHero({
  variant,
  className,
  children,
}: MarketingHeroProps) {
  return (
    <section
      className={cn(
        'relative w-full',
        'pt-20 pb-18 sm:pt-24 sm:pb-24 lg:pt-28 lg:pb-30',
        variant === 'centered' &&
          'mx-auto flex max-w-[1120px] flex-col items-center px-6 text-center sm:px-8 lg:px-10',
        variant === 'split' &&
          'mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-10 px-6 sm:px-8 md:grid-cols-2 md:gap-16 lg:px-10',
        className
      )}
    >
      {children}
    </section>
  );
}
