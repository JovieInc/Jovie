import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CopyLinkInput } from './CopyLinkInput';

const meta = {
  title: 'Dashboard/Atoms/CopyLinkInput',
  component: CopyLinkInput,
  parameters: {
    layout: 'centered',
  },
  args: {
    url: 'https://jov.ie/tim',
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
  },
  render: args => (
    <div className='w-72'>
      <CopyLinkInput {...args} />
    </div>
  ),
} satisfies Meta<typeof CopyLinkInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { size: 'sm' },
};

export const WithDisplayValue: Story = {
  args: {
    url: 'https://jov.ie/tim?utm_source=share',
    displayValue: 'jov.ie/tim',
  },
};
