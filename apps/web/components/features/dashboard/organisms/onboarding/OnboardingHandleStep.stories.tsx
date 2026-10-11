import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingHandleStep } from './OnboardingHandleStep';

const meta = {
  title: 'Features/Dashboard/Organisms/Onboarding/OnboardingHandleStep',
  component: OnboardingHandleStep,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'title',
        'handleInput',
        'isHydrated',
        'handleValidation',
        'stateError',
        'isSubmitting',
        'isTransitioning',
        'ctaDisabledReason',
        'inputRef',
        'onHandleChange',
        'onSubmit',
        'disabled',
        'isLoading',
      ],
    },
  },
} satisfies Meta<typeof OnboardingHandleStep>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Claim your handle',
    handleInput: 'artisthandle',
    isHydrated: true,
    handleValidation: {
      available: true,
      checking: false,
      error: null,
      clientValid: true,
      suggestions: [],
    },
    stateError: null,
    isSubmitting: false,
    isTransitioning: false,
    ctaDisabledReason: null,
    inputRef: { current: null },
    onHandleChange: () => {},
    onSubmit: () => {},
  },
};
