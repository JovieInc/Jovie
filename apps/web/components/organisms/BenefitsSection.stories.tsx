import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BenefitsSection } from './BenefitsSection';

const meta: Meta<typeof BenefitsSection> = {
  title: 'Organisms/BenefitsSection',
  component: BenefitsSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const CustomTitle: Story = {
  args: {
    title: 'Why Choose Our Platform?',
    description: 'We deliver results that matter to your music career.',
    badgeText: 'Why Us',
  },
};

export const CustomBenefits: Story = {
  args: {
    title: 'Platform Features',
    description: 'Everything you need to succeed as an artist.',
    badgeText: 'Features',
    benefits: [
      {
        title: 'Global Reach',
        description:
          'Connect with fans worldwide through our international platform.',
        metric: '195 countries',
        accent: 'blue',
      },
      {
        title: 'Real-time Analytics',
        description:
          'Track your performance with detailed insights and metrics.',
        metric: 'Live data',
        accent: 'green',
      },
      {
        title: 'Artist Support',
        description: 'Get help from our dedicated team whenever you need it.',
        metric: '24/7 support',
        accent: 'purple',
      },
    ],
  },
};

export const TwoBenefits: Story = {
  args: {
    title: 'Core Benefits',
    description: 'The two most important features for artist success.',
    badgeText: 'Core Features',
    benefits: [
      {
        title: 'Easy Setup',
        description:
          'Get started in minutes with our simple onboarding process.',
        metric: '2 min setup',
        accent: 'blue',
      },
      {
        title: 'Instant Results',
        description:
          'See immediate improvements in fan engagement and streams.',
        metric: 'Instant',
        accent: 'green',
      },
    ],
  },
};

export const FourBenefits: Story = {
  args: {
    title: 'Complete Solution',
    description: 'Everything an artist needs in one platform.',
    badgeText: 'Complete Package',
    benefits: [
      {
        title: 'Fast Performance',
        description: 'Lightning-fast loading times for better user experience.',
        metric: '0.5s load',
        accent: 'blue',
      },
      {
        title: 'High Conversion',
        description: 'Optimized design that turns visitors into fans.',
        metric: '60% conversion',
        accent: 'green',
      },
      {
        title: 'Smart Analytics',
        description: 'AI-powered insights to grow your audience.',
        metric: 'AI insights',
        accent: 'purple',
      },
      {
        title: 'Easy Management',
        description: 'Simple dashboard to manage all your content.',
        metric: 'One dashboard',
        accent: 'orange',
      },
    ],
  },
};

export const DifferentAccents: Story = {
  args: {
    title: 'Colorful Benefits',
    description: 'Showcase different accent colors for visual variety.',
    badgeText: 'Colors',
    benefits: [
      {
        title: 'Red Feature',
        description: 'This benefit uses red accent color.',
        metric: 'Red accent',
        accent: 'red',
      },
      {
        title: 'Orange Feature',
        description: 'This benefit uses orange accent color.',
        metric: 'Orange accent',
        accent: 'orange',
      },
      {
        title: 'Gray Feature',
        description: 'This benefit uses gray accent color.',
        metric: 'Gray accent',
        accent: 'gray',
      },
    ],
  },
};

export const InDarkMode: Story = {
  args: {},
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
