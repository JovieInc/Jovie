import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { OnboardingSecurityCheckRecovery } from './OnboardingSecurityCheckRecovery';
import type { OnboardingTurnstileStatus } from './OnboardingTurnstile';

function SecurityCheckSequence() {
  const [status, setStatus] = useState<OnboardingTurnstileStatus>('loading');
  const [draft, setDraft] = useState('I am Test Artist');

  return (
    <div className='flex min-h-screen flex-col bg-surface-1 p-4 text-primary-token'>
      <label className='text-xs'>
        Verification state (fixture)
        <select
          className='ml-2 bg-surface-0 text-primary-token'
          value={status}
          onChange={event =>
            setStatus(event.target.value as OnboardingTurnstileStatus)
          }
        >
          {[
            'loading',
            'interactive',
            'error',
            'expired',
            'timeout',
            'unsupported',
            'unconfigured',
            'verified',
          ].map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <div
        className='mx-auto mt-auto w-full max-w-2xl'
        data-testid='recovery-surface'
      >
        {status !== 'verified' ? (
          <OnboardingSecurityCheckRecovery
            status={status}
            isBusy={false}
            onRetry={() => setStatus('loading')}
            verification={
              status === 'interactive' ? (
                <div className='flex min-h-16 items-center rounded-lg border border-subtle bg-surface-0 px-3 text-xs'>
                  Verification widget fixture
                </div>
              ) : null
            }
          />
        ) : null}
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSubmit={() => setDraft('')}
          isLoading={status !== 'verified'}
          isSubmitting={false}
          dictationEnabled={false}
        />
      </div>
    </div>
  );
}

const meta = {
  title: 'Onboarding/Security Check Recovery',
  component: OnboardingSecurityCheckRecovery,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OnboardingSecurityCheckRecovery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StateSequence: Story = {
  args: { isBusy: false, onRetry: () => {} },
  render: () => <SecurityCheckSequence />,
};

const verificationFixture = (
  <div className='flex min-h-16 items-center rounded-lg border border-subtle bg-surface-0 px-3 text-xs'>
    Verification widget fixture
  </div>
);

/** Single-state fixtures render the recovery alone, beside no live widget. */
const narrowFrame: Decorator = Story => (
  <div className='mx-auto w-full max-w-md bg-surface-1 p-4 text-primary-token'>
    <Story />
  </div>
);

const single = {
  args: { isBusy: false, onRetry: fn() },
  decorators: [narrowFrame],
};

export const ErrorCheckFailed: Story = {
  ...single,
  args: { ...single.args, status: 'error' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'The check couldn’t load'
    );
  },
};

/** No status reported yet and no widget mounted: the default copy only. */
export const PartialNoStatus: Story = {
  ...single,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Checking your browser before sending your message.'
    );
  },
};

/** The widget slot grows; the retry row stays below it. */
export const LongVerificationContent: Story = {
  ...single,
  args: {
    ...single.args,
    status: 'interactive',
    verification: (
      <div className='flex min-h-32 items-center rounded-lg border border-subtle bg-surface-0 px-3 text-xs'>
        Verification widget fixture with a long explanation that wraps across
        several lines inside the narrow composer column without pushing the
        retry action out of reach.
      </div>
    ),
  },
};

/** The browser blocks security checks, so the copy asks to allow them. */
export const PermissionDeniedUnsupported: Story = {
  ...single,
  args: { ...single.args, status: 'unsupported' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Try allowing security checks in your browser'
    );
  },
};

export const RtlInteractive: Story = {
  ...single,
  args: {
    ...single.args,
    status: 'interactive',
    verification: verificationFixture,
  },
  decorators: [
    Story => (
      <div
        dir='rtl'
        className='mx-auto w-full max-w-xs bg-surface-1 p-4 text-primary-token'
      >
        <Story />
      </div>
    ),
  ],
};
