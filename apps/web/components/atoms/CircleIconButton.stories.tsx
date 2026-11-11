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

/** Only the required props: the default sm size and surface variant apply. */
export const PartialRequiredPropsOnly: Story = {
  args: {
    ariaLabel: 'Open On Phone',
    size: undefined,
    variant: undefined,
  },
};

/**
 * A long accessible name never widens the circle: the label is announced, not
 * drawn, so the 40px face holds its shape beside long copy.
 */
export const LongContentLabel: Story = {
  args: {
    ariaLabel:
      'Open this artist profile on your phone by scanning the QR code with your camera',
  },
  render: args => (
    <div className='flex w-64 items-center gap-2 text-app text-secondary-token'>
      <span className='min-w-0 flex-1 truncate'>
        Open this artist profile on your phone by scanning the QR code
      </span>
      <CircleIconButton {...args} />
    </div>
  ),
};

export const RtlInlineRow: Story = {
  args: {
    ariaLabel: 'افتح على الهاتف',
  },
  render: args => (
    <div
      dir='rtl'
      className='flex w-64 items-center gap-2 text-app text-secondary-token'
    >
      <span className='min-w-0 flex-1 truncate'>
        افتح الملف الشخصي للفنان على هاتفك بمسح الرمز
      </span>
      <CircleIconButton {...args} />
    </div>
  ),
};
