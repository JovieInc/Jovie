import { cn } from '@/lib/utils';

export interface MarketingHeroLayoutProps {
  readonly variant: 'split' | 'centered' | 'left';
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Hero section layout primitive.
 *
 * @deprecated Prefer the canonical content-driven `MarketingHero`
 * (`components/marketing/MarketingHero.tsx`) for landing-page heroes.
 * This layout shell remains for content-heavy page headers (blog,
 * changelog, support, compare) that are not marketing heroes.
 *
 * - `centered`: single column, text centered, constrained to page width
 * - `left`: single column, text left-aligned, constrained to page width
 * - `split`: two-column grid on md+, text left / media right
 *
 * Both variants include generous vertical padding matching Linear hero spacing.
 */
export function MarketingHeroLayout({
  variant,
  className,
  children,
}: MarketingHeroLayoutProps) {
  return (
    <section
      className={cn(
        'relative w-full',
        'pt-20 pb-16 sm:pt-24 sm:pb-24 lg:pt-28 lg:pb-32',
        variant === 'centered' &&
          'mx-auto flex max-w-300 flex-col items-center px-6 text-center sm:px-8 lg:px-10',
        variant === 'left' &&
          'mx-auto flex max-w-300 flex-col items-start px-6 text-left sm:px-8 lg:px-10',
        variant === 'split' &&
          'mx-auto grid max-w-320 grid-cols-1 items-center gap-10 px-6 sm:px-8 md:grid-cols-2 md:gap-16 lg:px-10',
        className
      )}
    >
      {children}
    </section>
  );
}
