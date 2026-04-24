'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

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
    <div className='mt-10 border-y border-border-primary'>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `${sectionId}-faq-trigger-${index}`;
        const panelId = `${sectionId}-faq-panel-${index}`;

        return (
          <div
            key={item.question}
            className='border-b border-border-primary last:border-b-0'
          >
            <button
              id={triggerId}
              type='button'
              aria-expanded={isOpen}
              aria-controls={panelId}
              className='focus-ring-themed flex w-full items-start justify-between gap-6 rounded-md py-5 text-left text-[17px] font-semibold leading-[1.35] tracking-[-0.018em] text-primary-token transition-opacity duration-150 hover:opacity-90'
              onClick={() => {
                setOpenIndex(isOpen ? null : index);
              }}
            >
              <span>{item.question}</span>
              <span
                aria-hidden='true'
                className={cn(
                  'mt-0.5 shrink-0 transition-colors duration-150',
                  isOpen ? 'text-primary-token' : 'text-secondary-token'
                )}
              >
                {isOpen ? (
                  <Minus className='h-4 w-4' strokeWidth={1.9} />
                ) : (
                  <Plus className='h-4 w-4' strokeWidth={1.9} />
                )}
              </span>
            </button>
            <section
              id={panelId}
              aria-labelledby={triggerId}
              aria-hidden={!isOpen}
              style={{ visibility: isOpen ? 'visible' : 'hidden' }}
              className={cn(
                'grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
                isOpen
                  ? 'mt-1 grid-rows-[1fr] opacity-100'
                  : 'mt-0 grid-rows-[0fr] opacity-0'
              )}
            >
              <div className='min-h-0 overflow-hidden'>
                <p className='pb-5 pr-10 text-[15px] leading-7 text-secondary-token'>
                  {item.answer}
                </p>
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
}
