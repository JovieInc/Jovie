import type { Meta, StoryObj } from '@storybook/react';

import { ProgressBar } from './progress';

const meta = {
  title: 'UI/Atoms/ProgressBar',
  component: ProgressBar,
  parameters: {
    docs: {
      description: {
        component:
          'Upload/import progress with optional label slot. See packages/ui/docs/loading-states.md.',
      },
    },
  },
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = {
  args: {
    value: 42,
    label: 'Importing releases',
    showValue: true,
  },
};

export const Indeterminate: Story = {
  args: {
    indeterminate: true,
    label: 'Finding music across platforms',
  },
};