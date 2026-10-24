import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
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
