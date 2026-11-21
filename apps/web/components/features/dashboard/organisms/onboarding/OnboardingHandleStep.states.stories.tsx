import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingHandleStep } from './OnboardingHandleStep';

const NOOP = () => {};

const meta = {
  title: 'Features/Dashboard/Organisms/Onboarding/OnboardingHandleStep/States',
  component: OnboardingHandleStep,
  parameters: { layout: 'centered' },
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
    onHandleChange: NOOP,
    onSubmit: NOOP,
  },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-2xl p-4'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof OnboardingHandleStep>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the availability check is running and submit shows a spinner. */
export const LoadingChecking: Story = {
  args: {
    handleValidation: {
      available: false,
      checking: true,
      error: null,
      clientValid: true,
      suggestions: [],
    },
  },
};

/** Empty: nothing typed yet, the placeholder shows and submit is disabled. */
export const EmptyHandle: Story = {
  args: { handleInput: '', ctaDisabledReason: 'Enter a handle' },
};

/** Error: the handle is taken and suggestions are offered. */
export const ErrorHandleTaken: Story = {
  args: {
    handleValidation: {
      available: false,
      checking: false,
      error: 'That handle is taken',
      clientValid: true,
      suggestions: ['artisthandle1', 'artisthandle-music'],
    },
    ctaDisabledReason: 'Choose another handle',
  },
};

/** Partial: the claim succeeded and the field confirms it. */
export const PartialClaimed: Story = {
  args: { autoSubmitClaimed: true },
};

/** Long content: a long handle stays inside the pill. */
export const LongContentHandle: Story = {
  args: {
    handleInput: 'averylonghandlethatkeepsgoingandgoingpastthefieldedge',
  },
};

/** Offline: the check failed with a connection error. */
export const OfflineStateError: Story = {
  args: {
    stateError: 'Check your connection and try again',
    ctaDisabledReason: 'Reconnect to continue',
  },
};

/** Permission denied: the handle is reserved for another account. */
export const PermissionDeniedReserved: Story = {
  args: {
    isReservedHandle: true,
    stateError: 'This handle is reserved',
    ctaDisabledReason: 'Choose another handle',
  },
};

/** Right to left: the pill mirrors under an Arabic document direction. */
export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
