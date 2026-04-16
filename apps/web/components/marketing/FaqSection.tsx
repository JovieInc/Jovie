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
  readonly singleOpen?: boolean;
}

export function FaqSection({
  items,
  className,
  headingClassName,
  heading = 'Frequently asked questions',
  singleOpen = false,
}: FaqSectionProps) {
  return (
    <section
      className={
        className ?? 'mx-auto max-w-[720px] px-6 pb-24 sm:px-8 lg:px-10'
      }
    >
      <h2
        className={
          headingClassName ?? 'text-2xl font-semibold text-primary-token'
        }
      >
        {heading}
      </h2>
      {singleOpen ? (
        <ClientFaqAccordion items={items} />
      ) : (
        <div className='mt-8 space-y-2'>
          {items.map(item => (
            <details key={item.question} className='group py-3'>
              <summary className='cursor-pointer text-base font-medium text-primary-token transition-colors hover:text-accent-token'>
                {item.question}
              </summary>
              <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
