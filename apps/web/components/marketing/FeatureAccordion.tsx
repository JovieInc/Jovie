'use client';

import { useState } from 'react';
import type { SubItem } from './NumberedSection';

interface FeatureAccordionProps {
  readonly items: SubItem[];
}

/**
 * Linear-style expandable sub-item accordion.
 * Renders items as "+1.1 Title" buttons that expand to show descriptions.
 */
export function FeatureAccordion({ items }: FeatureAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className='flex flex-wrap gap-2'>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const triggerId = `accordion-trigger-${item.number}`;
        const panelId = `accordion-panel-${item.number}`;

        return (
          <div key={item.number} className='w-full sm:w-auto'>
            <button
              type='button'
              id={triggerId}
              className='accordion-trigger'
              data-open={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className='section-number-label'>{item.number}</span>
              <span>{item.title}</span>
              <span className='accordion-icon' aria-hidden='true'>
                +
              </span>
            </button>

            <section
              id={panelId}
              className='accordion-content'
              data-open={isOpen}
              aria-labelledby={triggerId}
              hidden={!isOpen}
            >
              <p className='px-4 pt-3 pb-1 text-[13px] leading-relaxed text-tertiary-token'>
                {item.description}
              </p>
            </section>
          </div>
        );
      })}
    </div>
  );
}
