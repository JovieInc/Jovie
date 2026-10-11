import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PhoneFrame } from './PhoneFrame';

const meta = {
  title: 'Features/Home/PhoneFrame',
  component: PhoneFrame,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Re-export of the canonical @/components/molecules/PhoneFrame for the home feature surface.',
      },
    },
  },
} satisfies Meta<typeof PhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className='flex h-full items-center justify-center text-sm text-primary-token'>
        Screen content
      </div>
    ),
  },
};
