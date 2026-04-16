'use client';

import { useId, useState } from 'react';

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
  const sectionId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
      <div className='mt-8 space-y-2'>
        {items.map((item, index) => {
          if (!singleOpen) {
            return (
              <details key={item.question} className='group py-3'>
                <summary className='cursor-pointer text-base font-medium text-primary-token transition-colors hover:text-accent-token'>
                  {item.question}
                </summary>
                <p className='mt-3 text-sm leading-relaxed text-secondary-token'>
                  {item.answer}
                </p>
              </details>
            );
          }

          const isOpen = openIndex === index;
          const triggerId = `${sectionId}-faq-trigger-${index}`;
          const panelId = `${sectionId}-faq-panel-${index}`;

          return (
            <div key={item.question} className='py-3'>
              <button
                id={triggerId}
                type='button'
                aria-expanded={isOpen}
                aria-controls={panelId}
                className='w-full cursor-pointer text-left text-base font-medium text-primary-token transition-colors hover:text-accent-token'
                onClick={() => {
                  setOpenIndex(isOpen ? null : index);
                }}
              >
                {item.question}
              </button>
              <section
                id={panelId}
                aria-labelledby={triggerId}
                className='mt-3 text-sm leading-relaxed text-secondary-token'
                hidden={!isOpen}
              >
                {item.answer}
              </section>
            </div>
          );
        })}
      </div>
    </section>
  );
}
