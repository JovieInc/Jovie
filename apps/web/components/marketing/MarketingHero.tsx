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
        'pt-16 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32',
        variant === 'centered' &&
          'mx-auto flex max-w-[1024px] flex-col items-center px-5 text-center sm:px-6 lg:px-8',
        variant === 'split' &&
          'mx-auto grid max-w-[1344px] grid-cols-1 items-center gap-10 px-5 sm:px-6 md:grid-cols-2 md:gap-16 lg:px-8',
        className
      )}
    >
      {children}
    </section>
  );
}
