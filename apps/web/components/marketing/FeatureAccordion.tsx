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

        return (
          <div key={item.number} className='w-full sm:w-auto'>
            <button
              type='button'
              className='accordion-trigger'
              data-open={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span className='section-number-label'>{item.number}</span>
              <span>{item.title}</span>
              <span className='accordion-icon' aria-hidden='true'>
                +
              </span>
            </button>

            <div className='accordion-content' data-open={isOpen}>
              <div>
                <p className='px-4 pt-3 pb-1 text-[13px] leading-relaxed text-tertiary-token'>
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
