import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderIconButton } from './HeaderIconButton';

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
  title: 'Atoms/HeaderIconButton',
  component: HeaderIconButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    ariaLabel: 'Header action',
    children: <PlaceholderIcon />,
  },
} satisfies Meta<typeof HeaderIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const ExtraSmall: Story = {
  args: {
    size: 'xs',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
