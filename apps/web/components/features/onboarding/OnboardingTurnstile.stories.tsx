import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingTurnstile } from './OnboardingTurnstile';

const meta = {
  title: 'Onboarding/OnboardingTurnstile',
  component: OnboardingTurnstile,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Cloudflare Turnstile is intentionally bypassed in deterministic Storybook and AUTH_MOCK runtimes. Production challenge behavior is covered by focused component tests.',
      },
    },
    jovie: {
      // `loading` is an OnboardingTurnstileStatus value, not a component prop.
      uncoveredProps: ['loading'],
    },
  },
} satisfies Meta<typeof OnboardingTurnstile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeterministicBypass: Story = {
  args: {
    onToken: () => undefined,
    onStateChange: () => undefined,
  },
  render: args => (
    <div className='rounded-lg border border-subtle bg-surface-1 px-4 py-3 text-sm text-secondary-token'>
      <OnboardingTurnstile {...args} />
      Onboarding Turnstile is bypassed in deterministic Storybook.
    </div>
  ),
};
