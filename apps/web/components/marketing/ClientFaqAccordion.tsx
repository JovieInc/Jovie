'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface ClientFaqAccordionProps {
  readonly items: readonly {
    readonly question: string;
    readonly answer: string;
  }[];
  readonly analyticsEventName?: string;
  readonly analyticsProperties?: Record<string, string | number | boolean>;
}

export function ClientFaqAccordion({
  items,
  analyticsEventName,
  analyticsProperties,
}: Readonly<ClientFaqAccordionProps>) {
  const sectionId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className='faq-accordion mt-10 border-y border-border-primary'>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `${sectionId}-faq-trigger-${index}`;
        const panelId = `${sectionId}-faq-panel-${index}`;

        return (
          <div
            key={item.question}
            className='faq-accordion__item border-b border-border-primary last:border-b-0'
          >
            <button
              id={triggerId}
              type='button'
              aria-expanded={isOpen}
              aria-controls={panelId}
              className='faq-accordion__trigger focus-ring-themed flex w-full items-start justify-between gap-6 rounded-md py-5 text-left text-base font-semibold leading-[1.35] tracking-[-0.018em] text-primary-token transition-opacity duration-subtle hover:opacity-90'
              onClick={() => {
                const nextIndex = isOpen ? null : index;
                setOpenIndex(nextIndex);
                if (analyticsEventName && nextIndex !== null) {
                  track(analyticsEventName, {
                    ...analyticsProperties,
                    question: item.question,
                    index,
                  });
                }
              }}
            >
              <span>{item.question}</span>
              <span
                aria-hidden='true'
                className={cn(
                  'faq-accordion__icon mt-0.5 shrink-0 transition-colors duration-subtle',
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
                'faq-accordion__panel grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-subtle ease-subtle motion-reduce:transition-none',
                isOpen
                  ? 'mt-1 grid-rows-[1fr] opacity-100'
                  : 'mt-0 grid-rows-[0fr] opacity-0'
              )}
            >
              <div className='min-h-0 overflow-hidden'>
                <p className='faq-accordion__answer pb-5 pr-10 text-mid leading-7 text-secondary-token'>
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
