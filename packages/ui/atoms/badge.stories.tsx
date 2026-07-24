import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Atoms/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Beta',
  },
};

export const PermissionRestricted: Story = {
  args: {
    variant: 'permission-restricted',
    children: 'Admin only',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Permission-restricted state using data-state="permission-restricted" and warning tokens.',
      },
    },
  },
};
