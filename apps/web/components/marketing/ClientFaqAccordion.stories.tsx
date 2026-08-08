import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClientFaqAccordion } from './ClientFaqAccordion';

const meta: Meta<typeof ClientFaqAccordion> = {
  title: 'Marketing/Sections/ClientFaqAccordion',
  component: ClientFaqAccordion,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-[min(42rem,calc(100vw-2rem))] bg-base p-6 text-primary-token'>
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
    ],
  },
};
