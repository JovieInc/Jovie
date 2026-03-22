import { cn } from '@/lib/utils';
import { MarketingContainer } from './MarketingContainer';

export interface MarketingSectionFrameProps {
  readonly className?: string;
  readonly children: React.ReactNode;
  readonly eyebrow?: string;
  readonly reverse?: boolean;
}

/**
 * Standard marketing section frame with Linear-style vertical spacing.
 *
 * Wraps children in a `landing`-width MarketingContainer with
 * `section-spacing-linear` padding. Optionally renders a pill-shaped
 * eyebrow badge and supports reversing the grid column order.
 */
export function MarketingSectionFrame({
  className,
  children,
  eyebrow,
  reverse,
}: MarketingSectionFrameProps) {
  return (
    <section className={cn('section-spacing-linear', className)}>
      <MarketingContainer width='landing'>
        {eyebrow && (
          <div className={cn('mb-8 lg:mb-10', reverse && 'md:text-right')}>
            <span className='homepage-section-eyebrow'>{eyebrow}</span>
          </div>
        )}
        <div
          className={cn(
            'homepage-section-intro',
            reverse && 'md:[direction:rtl] md:[&>*]:[direction:ltr]'
          )}
        >
          {children}
        </div>
      </MarketingContainer>
    </section>
  );
}
