import { cn } from '@/lib/utils';
import { ClientFaqAccordion } from './ClientFaqAccordion';

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

interface FaqSectionProps {
  readonly items: readonly FaqItem[];
  readonly className?: string;
  readonly headingClassName?: string;
  readonly heading?: string;
  readonly analyticsEventName?: string;
  readonly analyticsProperties?: Record<string, string | number | boolean>;
}

export function FaqSection({
  items,
  className,
  headingClassName,
  heading = 'Frequently Asked Questions',
  analyticsEventName,
  analyticsProperties,
}: FaqSectionProps) {
  return (
    <section
      className={cn(
        'faq-section',
        className ?? 'mx-auto max-w-190 px-6 pb-24 sm:px-8 lg:px-10'
      )}
    >
      <h2
        className={cn(
          'faq-section__heading',
          headingClassName ?? 'marketing-h2-linear text-primary-token'
        )}
      >
        {heading}
      </h2>
      <ClientFaqAccordion
        items={items}
        analyticsEventName={analyticsEventName}
        analyticsProperties={analyticsProperties}
      />
    </section>
  );
}
