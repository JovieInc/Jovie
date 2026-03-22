import { cn } from '@/lib/utils';
import { FeatureAccordion } from './FeatureAccordion';
import { MarketingContainer } from './MarketingContainer';

export interface SubItem {
  readonly number: string;
  readonly title: string;
  readonly description: string;
}

export interface NumberedSectionProps {
  readonly sectionNumber: string;
  readonly sectionTitle: string;
  readonly heading: string;
  readonly description: string;
  readonly children: React.ReactNode;
  readonly subItems?: SubItem[];
  readonly id?: string;
  readonly className?: string;
}

/**
 * Linear-style numbered section with section label, heading,
 * description, visual content area, and expandable sub-items.
 *
 * Mirrors Linear's "1.0 Intake →" pattern.
 */
export function NumberedSection({
  sectionNumber,
  sectionTitle,
  heading,
  description,
  children,
  subItems,
  id,
  className,
}: NumberedSectionProps) {
  return (
    <section id={id} className={cn('section-spacing-linear', className)}>
      <MarketingContainer width='landing'>
        <div className='reveal-on-scroll'>
          <div className='mb-6 flex items-center gap-3'>
            <span className='section-number-label'>{sectionNumber}</span>
            <span className='section-title-link'>{sectionTitle} →</span>
          </div>

          <h2 className='marketing-h2-linear max-w-[20ch] text-primary-token'>
            {heading}
          </h2>
          <p className='mt-4 max-w-xl marketing-lead-linear text-secondary-token'>
            {description}
          </p>
        </div>

        <div className='reveal-on-scroll mt-10 lg:mt-14' data-delay='80'>
          {children}
        </div>

        {subItems && subItems.length > 0 && (
          <div className='reveal-on-scroll mt-8 lg:mt-10' data-delay='160'>
            <FeatureAccordion items={subItems} />
          </div>
        )}
      </MarketingContainer>
    </section>
  );
}
