import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingNameStep } from './OnboardingNameStep';

const meta = {
  title: 'Features/Dashboard/Organisms/Onboarding/OnboardingNameStep',
  component: OnboardingNameStep,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'title',
        'fullName',
        'namePlaceholder',
        'isValid',
        'isTransitioning',
        'isSubmitting',
        'inputRef',
        'onNameChange',
        'onSubmit',
      ],
    },
  },
} satisfies Meta<typeof OnboardingNameStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
