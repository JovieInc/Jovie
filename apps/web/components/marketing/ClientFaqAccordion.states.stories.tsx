import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClientFaqAccordion } from './ClientFaqAccordion';

const meta = {
  title: 'Marketing/Sections/ClientFaqAccordion/States',
  component: ClientFaqAccordion,
  parameters: { layout: 'centered' },
  decorators: [
    function FaqFrame(Story) {
      return (
        <div className='w-full max-w-2xl bg-base p-6 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ClientFaqAccordion>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no questions, so only the frame renders. */
export const EmptyNoQuestions: Story = { args: { items: [] } };

/** Partial: a single question with a short answer. */
export const PartialSingleQuestion: Story = {
  args: { items: [{ question: 'Is it free?', answer: 'Yes, to start.' }] },
};

/** Long content: long questions and answers wrap. */
export const LongContentWrapped: Story = {
  args: {
    items: [
      {
        question:
          'What happens to my existing links, playlists and smart pages when I move my whole catalog to Jovie from another tool?',
        answer:
          'Everything you already shared keeps working. Jovie imports your releases, matches each one to its streaming links and keeps the old URLs redirecting while the new pages roll out, so fans never hit a dead end and your analytics keep one continuous history across the move.',
      },
    ],
  },
};

/** Rtl: the trigger and icon mirror in a right-to-left layout. */
export const RtlQuestions: Story = {
  args: {
    items: [
      { question: 'هل هو مجاني؟', answer: 'نعم، للبدء.' },
      { question: 'هل يمكنني استيراد ملفي؟', answer: 'نعم.' },
    ],
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-2xl bg-base p-6'>
          <Story />
        </div>
      );
    },
  ],
};
