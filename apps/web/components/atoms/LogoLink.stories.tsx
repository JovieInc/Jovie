import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLink } from './LogoLink';

const meta = {
  title: 'Atoms/LogoLink',
  component: LogoLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/',
    logoSize: 'sm',
    variant: 'word',
  },
} satisfies Meta<typeof LogoLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomDestination: Story = {
  args: {
    href: '/app',
    logoSize: 'md',
    prefetch: false,
    'data-testid': 'storybook-app-logo',
  },
};

export const Icon: Story = {
  args: {
    variant: 'icon',
    logoSize: 'md',
  },
};

export const Full: Story = {
  args: {
    variant: 'full',
    logoSize: 'md',
  },
};

export const Large: Story = {
  args: {
    logoSize: 'lg',
    variant: 'word',
  },
};

export const CustomHref: Story = {
  args: {
    href: '/custom',
  },
};

/** The Latin wordmark and the icon reveal in a right-to-left Arabic header. */
export const RtlArabicHeader: Story = {
  args: {
    variant: 'icon',
    logoSize: 'md',
    reveal: true,
  },
  render: args => (
    <header
      dir='rtl'
      lang='ar'
      className='flex w-80 items-center justify-between gap-4 rounded-lg border border-subtle bg-surface-1 px-4 py-3'
    >
      <LogoLink {...args} />
      <span className='text-sm text-secondary-token'>الصفحة الرئيسية</span>
    </header>
  ),
};
