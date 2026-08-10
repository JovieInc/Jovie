import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FaqSection } from './FaqSection';

const meta: Meta<typeof FaqSection> = {
  title: 'Marketing/Sections/FaqSection',
  component: FaqSection,
  // Disclosure geometry must be exercised in normal document flow. Storybook's
  // centered layout re-centers the entire story whenever an answer opens,
  // creating an unrelated outer-canvas shift that the component does not own.
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='mx-auto w-[min(42rem,calc(100vw-2rem))] bg-base p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      {
        question: 'What does Jovie keep moving?',
        answer:
          'Your artist profile, release links, and audience signals stay connected in one focused workspace.',
      },
      {
        question: 'Can I start with an existing profile?',
        answer:
          'Yes. Jovie keeps the public surface grounded in real artist data.',
      },
      {
        question: 'What happens when my next release lands?',
        answer:
          'The same profile can foreground the release without replacing the links and audience context already there.',
      },
    ],
  },
};
