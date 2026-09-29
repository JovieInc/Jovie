import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClaimHandleForm } from './ClaimHandleForm';

const meta = {
  title: 'Features/Home/ClaimHandleForm',
  component: ClaimHandleForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Re-export of the modular claim-handle form for the home feature surface.',
      },
    },
  },
} satisfies Meta<typeof ClaimHandleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hero: Story = {
  args: {
    size: 'hero',
  },
};
