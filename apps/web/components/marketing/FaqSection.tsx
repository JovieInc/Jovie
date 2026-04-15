interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  readonly items: FaqItem[];
  readonly className?: string;
  readonly headingClassName?: string;
  readonly heading?: string;
}

export function FaqSection({
  items,
  className,
  headingClassName,
  heading = 'Frequently asked questions',
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
      <div className='mt-8 divide-y divide-border-primary'>
        {items.map(item => (
          <details key={item.question} className='group py-5'>
            <summary className='cursor-pointer text-base font-medium text-primary-token transition-colors hover:text-accent-token'>
              {item.question}
            </summary>
            <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
