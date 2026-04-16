'use client';

import { useId, useState } from 'react';

interface ClientFaqAccordionProps {
  readonly items: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
}

export function ClientFaqAccordion({
  items,
}: Readonly<ClientFaqAccordionProps>) {
  const sectionId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className='mt-8 space-y-2'>
      {items.map((item, index) => {
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
  );
}
