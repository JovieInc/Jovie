import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthTextInput } from './AuthTextInput';

const meta = {
  title: 'Features/Auth/AuthTextInput',
  component: AuthTextInput,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Re-export of the canonical @/components/atoms/AuthTextInput for the auth feature surface.',
      },
    },
  },
} satisfies Meta<typeof AuthTextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'you@example.com',
    'aria-label': 'Email address',
  },
};
