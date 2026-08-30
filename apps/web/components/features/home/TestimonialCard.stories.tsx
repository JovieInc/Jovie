import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TestimonialCard } from './TestimonialCard';

const meta = {
  title: 'Marketing/Sections/TestimonialCard',
  component: TestimonialCard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TestimonialCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'Tim White',
    title: 'Artist',
    quote: 'Jovie keeps the release work in one place.',
    initials: 'TW',
  },
};
