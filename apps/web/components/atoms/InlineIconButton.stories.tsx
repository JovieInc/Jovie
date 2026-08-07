import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InlineIconButton } from './InlineIconButton';

const PlaceholderIcon = () => (
  <svg
    aria-hidden='true'
    viewBox='0 0 16 16'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.5'
    className='h-4 w-4'
  >
    <circle cx='8' cy='8' r='6' />
  </svg>
);

const meta = {
  title: 'Atoms/InlineIconButton',
  component: InlineIconButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Inline action',
    children: <PlaceholderIcon />,
  },
} satisfies Meta<typeof InlineIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {};

export const FadeOnParentHover: Story = {
  args: {
    fadeOnParentHover: true,
  },
  render: args => (
    <div className='group rounded-md border border-subtle p-4'>
      <InlineIconButton {...args} />
    </div>
  ),
};

export const AsLink: Story = {
  args: {
    href: '/',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
