import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingFormWrapper } from './OnboardingFormWrapper';

const meta: Meta<typeof OnboardingFormWrapper> = {
  title: 'Dashboard/Organisms/OnboardingFormWrapper',
  component: OnboardingFormWrapper,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f8fafc' }, // Light background
        { name: 'dark', value: '#0D0E12' }, // Dark background
      ],
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const UnifiedOnboardingForm: Story = {
  parameters: {
    docs: {
      description: {
        story: 'The unified onboarding form using Apple-style design.',
      },
    },
  },
};

// Dark mode variant
export const UnifiedOnboardingFormDarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'The unified onboarding form with dark mode enabled.',
      },
    },
  },
  decorators: [
    Story => (
      <div className='dark w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
};
