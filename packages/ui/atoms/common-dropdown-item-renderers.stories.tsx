import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CommonDropdownItemLabel } from './common-dropdown-item-renderers';

const meta = {
  title: 'UI/Atoms/CommonDropdown/ItemLabel',
  component: CommonDropdownItemLabel,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof CommonDropdownItemLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Edit profile' },
};

export const WithDescription: Story = {
  args: {
    label: 'Publish release',
    description: 'Visible to everyone',
  },
};
