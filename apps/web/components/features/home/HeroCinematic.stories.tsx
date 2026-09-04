import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroCinematic } from './HeroCinematic';

const meta = {
  title: 'Marketing/Sections/HeroCinematic',
  component: HeroCinematic,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'heroPrimaryAction',
        'headingClassName',
        'headingContent',
        'leadClassName',
        'actionClassName',
        'proofClassName',
      ],
    },
  },
} satisfies Meta<typeof HeroCinematic>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    fullScreen: false,
  },
};

export const FullScreen: Story = {
  args: {
    fullScreen: true,
  },
};
