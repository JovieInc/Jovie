import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppIconButton } from './AppIconButton';

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
  title: 'Atoms/AppIconButton',
  component: AppIconButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    ariaLabel: 'App action',
    children: <PlaceholderIcon />,
  },
} satisfies Meta<typeof AppIconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithTooltip: Story = {
  args: {
    tooltipLabel: 'App action',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
