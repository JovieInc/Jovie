import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CTASection } from './CTASection';

const meta = {
  title: 'Organisms/CTASection',
  component: CTASection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    title: 'Ready to grow your fanbase?',
    buttonText: 'Get started',
    buttonHref: '/start',
    description:
      'Set up your Jovie page in minutes, free forever on the base plan.',
  },
} satisfies Meta<typeof CTASection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const WithoutDescription: Story = {
  args: {
    description: undefined,
  },
};
