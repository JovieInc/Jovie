import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HowItWorksSection } from './HowItWorksSection';

const meta: Meta<typeof HowItWorksSection> = {
  title: 'Organisms/HowItWorksSection',
  component: HowItWorksSection,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    showAccentBorder: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const CustomContent: Story = {
  args: {
    title: 'How to Get Started',
    description: 'Simple steps to launch your music career',
    badgeText: 'Getting Started',
    steps: [
      {
        number: '01',
        title: 'Sign Up',
        description: 'Create your account and set up your artist profile.',
      },
      {
        number: '02',
        title: 'Upload Music',
        description: 'Add your tracks and connect your streaming platforms.',
      },
      {
        number: '03',
        title: 'Share & Grow',
        description: 'Share your link and watch your fanbase grow.',
      },
    ],
  },
};

export const TwoSteps: Story = {
  args: {
    title: 'Quick Setup Process',
    description: 'Get started in just two simple steps',
    badgeText: 'Quick Start',
    steps: [
      {
        number: '01',
        title: 'Connect Account',
        description: 'Link your Spotify or Apple Music artist account.',
      },
      {
        number: '02',
        title: 'Go Live',
        description: 'Your profile is ready to share with fans.',
      },
    ],
  },
};

export const FourSteps: Story = {
  args: {
    title: 'Complete Onboarding',
    description: 'Everything you need to know to get started',
    badgeText: 'Full Process',
    steps: [
      {
        number: '01',
        title: 'Create Account',
        description: 'Sign up with your email and choose your username.',
      },
      {
        number: '02',
        title: 'Verify Artist',
        description: 'Connect and verify your artist profiles.',
      },
      {
        number: '03',
        title: 'Customize Profile',
        description: 'Add your bio, photos, and social links.',
      },
      {
        number: '04',
        title: 'Launch & Share',
        description: 'Your profile is ready to share with the world.',
      },
    ],
  },
};

export const WithoutAccentBorder: Story = {
  args: {
    title: 'Clean Process',
    description: 'How it works without the accent border',
    showAccentBorder: false,
  },
};

export const BusinessProcess: Story = {
  args: {
    title: 'How We Help Your Business',
    description: 'Our proven process for business success',
    badgeText: 'Our Process',
    steps: [
      {
        number: '01',
        title: 'Discovery',
        description:
          'We analyze your current situation and identify opportunities.',
      },
      {
        number: '02',
        title: 'Strategy',
        description: 'We create a custom plan tailored to your specific needs.',
      },
      {
        number: '03',
        title: 'Execution',
        description: 'We implement the solution and monitor progress closely.',
      },
    ],
  },
};

export const DifferentNumbering: Story = {
  args: {
    title: 'Phase-Based Approach',
    description: 'Our development process broken into phases',
    badgeText: 'Development',
    steps: [
      {
        number: 'α',
        title: 'Alpha Phase',
        description: 'Initial development and core feature implementation.',
      },
      {
        number: 'β',
        title: 'Beta Phase',
        description: 'Testing with select users and gathering feedback.',
      },
      {
        number: 'γ',
        title: 'Launch Phase',
        description: 'Public release and ongoing optimization.',
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
