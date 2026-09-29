import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroSection } from './HeroSection';

const meta = {
  title: 'Organisms/HeroSection',
  component: HeroSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    headline: 'Turn fans into streams',
    highlightText: 'streams',
    subtitle: 'One link for every platform your fans use.',
  },
} satisfies Meta<typeof HeroSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithContent: Story = {
  args: {
    children: (
      <p className='text-center text-sm text-secondary-token'>
        Sign-up form goes here
      </p>
    ),
    supportingText: 'Free forever on the base plan.',
  },
};

export const WithIconAndTrustIndicators: Story = {
  args: {
    icon: '🎵',
    trustIndicators: (
      <p className='text-2xs text-tertiary-token'>
        Trusted by 10,000+ independent artists
      </p>
    ),
  },
};

export const NoBackgroundEffects: Story = {
  args: {
    children: (
      <p className='text-center text-sm text-secondary-token'>Form content</p>
    ),
    showBackgroundEffects: false,
  },
};
