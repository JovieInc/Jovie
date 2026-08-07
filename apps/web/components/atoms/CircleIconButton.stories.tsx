import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CircleIconButton } from './CircleIconButton';

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
  title: 'Atoms/CircleIconButton',
  component: CircleIconButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    ariaLabel: 'Circle action',
    children: <PlaceholderIcon />,
  },
} satisfies Meta<typeof CircleIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Surface: Story = {};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
  },
};

export const Frosted: Story = {
  args: {
    variant: 'frosted',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
