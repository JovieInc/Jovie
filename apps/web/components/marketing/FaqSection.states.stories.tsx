import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FaqSection } from './FaqSection';

const meta: Meta<typeof FaqSection> = {
  title: 'Marketing/Sections/FaqSection States',
  component: FaqSection,
  // Same normal-flow layout as the default story, so an opening answer does
  // not re-center the canvas.
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='mx-auto w-full max-w-2xl bg-base p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a section whose record has no questions yet. */
export const EmptyNoQuestions: Story = {
  args: { items: [], heading: 'Questions' },
};

/** Partial: one question under the default heading. */
export const PartialSingleQuestion: Story = {
  args: {
    items: [
      {
        question: 'Can I start with an existing profile?',
        answer:
          'Yes. Jovie keeps the public surface grounded in real artist data.',
      },
    ],
  },
};

/** Long content: wrapping questions and long answers. */
export const LongContentAnswers: Story = {
  args: {
    heading:
      'Everything artists, managers and labels ask before they move their releases',
    items: [
      {
        question:
          'What happens to my existing links, presaves and fan list when I move my profile over to Jovie from another link-in-bio service?',
        answer:
          'Your links come across as they are, presaves keep counting toward release day, and the fans who asked for updates stay on your list. Nothing is sent to them until you approve it, and you can export the list at any time without asking us first.',
      },
      {
        question: 'Can I start with an existing profile?',
        answer:
          'Yes. Jovie keeps the public surface grounded in real artist data, so the profile reads from the same catalog your distributor already sent to every service.',
      },
    ],
  },
};

/** Right-to-left: Arabic questions in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    heading: 'الأسئلة الشائعة',
    items: [
      {
        question: 'هل يمكنني البدء بصفحة موجودة؟',
        answer: 'نعم. تبقى صفحتك مبنية على بيانات حقيقية.',
      },
      {
        question: 'ماذا يحدث عند صدور أغنيتي التالية؟',
        answer: 'تتقدم الأغنية في الصفحة دون استبدال روابطك.',
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
