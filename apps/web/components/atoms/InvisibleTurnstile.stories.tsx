import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InvisibleTurnstile } from './InvisibleTurnstile';

const meta = {
  title: 'Atoms/InvisibleTurnstile',
  component: InvisibleTurnstile,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Cloudflare Turnstile is intentionally bypassed in deterministic Storybook. Production challenge behavior is covered by focused component tests.',
      },
    },
  },
} satisfies Meta<typeof InvisibleTurnstile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeterministicBypass: Story = {
  args: {
    onToken: () => undefined,
  },
  render: args => (
    <div className='rounded-lg border border-subtle bg-surface-1 px-4 py-3 text-sm text-secondary-token'>
      <InvisibleTurnstile {...args} />
      Turnstile is bypassed in deterministic Storybook.
    </div>
  ),
};
