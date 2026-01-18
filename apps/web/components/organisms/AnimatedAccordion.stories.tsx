import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { AnimatedAccordion } from './AnimatedAccordion';

const meta: Meta<typeof AnimatedAccordion> = {
  title: 'Organisms/AnimatedAccordion',
  component: AnimatedAccordion,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    delay: {
      control: { type: 'range', min: 0, max: 1, step: 0.1 },
    },
    duration: {
      control: { type: 'range', min: 0.1, max: 1, step: 0.1 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof AnimatedAccordion>;

export const Open: Story = {
  args: {
    isOpen: true,
    children: (
      <div className='p-4 bg-surface-1 border border-subtle rounded-lg'>
        <p className='text-secondary'>
          This content is visible when the accordion is open. It animates
          smoothly in and out.
        </p>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const Closed: Story = {
  args: {
    isOpen: false,
    children: (
      <div className='p-4 bg-surface-1 border border-subtle rounded-lg'>
        <p className='text-secondary'>This content is hidden.</p>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export const Interactive: Story = {
  render: function InteractiveAccordion() {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className='w-80 space-y-4'>
        <button
          type='button'
          onClick={() => setIsOpen(!isOpen)}
          className='w-full px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-md font-medium'
        >
          {isOpen ? 'Close' : 'Open'} Accordion
        </button>
        <AnimatedAccordion isOpen={isOpen}>
          <div className='p-4 bg-surface-1 border border-subtle rounded-lg'>
            <h3 className='font-semibold mb-2'>Accordion Content</h3>
            <p className='text-secondary text-sm'>
              This content animates smoothly when toggled. The animation
              respects reduced motion preferences.
            </p>
          </div>
        </AnimatedAccordion>
      </div>
    );
  },
};

export const FAQExample: Story = {
  render: function FAQAccordion() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const faqs = [
      {
        q: 'What is Jovie?',
        a: 'Jovie is a link-in-bio platform for artists and creators.',
      },
      {
        q: 'Is it free?',
        a: 'Yes! Jovie offers a free tier with all essential features.',
      },
      {
        q: 'Can I remove branding?',
        a: 'Yes, upgrade to Pro for $5/month to remove branding.',
      },
    ];

    return (
      <div className='w-96 space-y-2'>
        {faqs.map((faq, index) => (
          <div
            key={faq.q}
            className='border border-subtle rounded-lg overflow-hidden'
          >
            <button
              type='button'
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className='w-full px-4 py-3 text-left font-medium flex justify-between items-center'
            >
              {faq.q}
              <span>{openIndex === index ? '−' : '+'}</span>
            </button>
            <AnimatedAccordion isOpen={openIndex === index}>
              <div className='px-4 pb-3 text-secondary text-sm'>{faq.a}</div>
            </AnimatedAccordion>
          </div>
        ))}
      </div>
    );
  },
};
