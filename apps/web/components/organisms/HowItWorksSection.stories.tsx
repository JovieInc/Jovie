import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HowItWorksSection } from './HowItWorksSection';

const meta = {
  title: 'Organisms/HowItWorksSection',
  component: HowItWorksSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HowItWorksSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutAccentBorder: Story = {
  args: {
    showAccentBorder: false,
  },
};

export const TwoSteps: Story = {
  args: {
    steps: [
      {
        number: '01',
        title: 'Claim your handle',
        description: 'Pick a name fans will remember.',
      },
      {
        number: '02',
        title: 'Share your link',
        description: 'One link, every platform.',
      },
    ],
  },
};
