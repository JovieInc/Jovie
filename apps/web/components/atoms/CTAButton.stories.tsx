import type { Meta, StoryObj } from '@storybook/react';
import { CTAButton, type CTAButtonProps } from './CTAButton';

const meta: Meta<typeof CTAButton> = {
  title: 'UI/CTAButton',
  component: CTAButton,
  args: {
    children: 'Get started',
    variant: 'primary',
  },
};

export default meta;

type Story = StoryObj<typeof CTAButton>;

export const Primary: Story = {
  args: {
    children: 'Join the waitlist',
  },
};

export const WithIcon: Story = {
  args: {
    children: 'Upgrade to Pro',
    icon: (
      <span aria-hidden className='h-4 w-4'>
        ✨
      </span>
    ),
  },
};

export const Loading: Story = {
  args: {
    children: 'Processing',
    isLoading: true,
  },
};

export const Success: Story = {
  args: {
    children: 'Saved',
    isSuccess: true,
  },
};

export const AsLink: Story = {
  args: {
    children: 'Explore pricing',
    href: '/pricing',
    variant: 'secondary',
  },
};

export const ExternalLink: Story = {
  args: {
    children: 'Open docs',
    href: 'https://jovie.so/docs',
    external: true,
    variant: 'outline',
  },
};

export const Sizes: Story = {
  render: (args: CTAButtonProps) => (
    <div className='flex flex-wrap items-center gap-4'>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <CTAButton key={size} {...args} size={size}>
          {size.toUpperCase()}
        </CTAButton>
      ))}
    </div>
  ),
};

export const StateTransitions: Story = {
  render: () => (
    <div className='flex flex-wrap gap-4'>
      <CTAButton href='/'>Explore</CTAButton>
      <CTAButton isLoading>Saving</CTAButton>
      <CTAButton isSuccess>Saved</CTAButton>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-wrap gap-4'>
      <CTAButton variant='primary'>Primary</CTAButton>
      <CTAButton variant='secondary'>Secondary</CTAButton>
      <CTAButton variant='outline'>Outline</CTAButton>
      <CTAButton variant='ghost'>Ghost</CTAButton>
    </div>
  ),
};

export const ThemeComparison: Story = {
  render: () => (
    <div className='space-y-4'>
      <div className='flex items-center gap-4 rounded-lg bg-white p-6 text-gray-900 shadow'>
        <CTAButton>Light mode CTA</CTAButton>
        <CTAButton variant='outline'>Secondary</CTAButton>
      </div>
      <div className='flex items-center gap-4 rounded-lg bg-gray-900 p-6 text-white'>
        <CTAButton>Dark mode CTA</CTAButton>
        <CTAButton variant='outline'>Secondary</CTAButton>
      </div>
    </div>
  ),
};
