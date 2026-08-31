import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthModalShell } from './AuthModalShell';

const meta: Meta<typeof AuthModalShell> = {
  title: 'Auth/AuthModalShell',
  component: AuthModalShell,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
    },
    chromatic: {
      viewports: [390, 768, 1280],
    },
  },
};

export default meta;
type Story = StoryObj<typeof AuthModalShell>;

const SampleForm = () => (
  <div className='space-y-4'>
    <p className='text-sm text-secondary-token'>Continue with email</p>
    <input
      type='email'
      placeholder='you@example.com'
      className='w-full rounded-xl border border-subtle bg-surface-0 px-3 py-2 text-primary-token placeholder:text-tertiary-token'
    />
    <button
      type='button'
      className='w-full rounded-xl bg-btn-primary py-2 font-medium text-btn-primary-foreground'
    >
      Continue
    </button>
  </div>
);

export const Default: Story = {
  args: {
    ariaLabel: 'Authentication',
    children: <SampleForm />,
  },
};

export const WithStatusRow: Story = {
  args: {
    ariaLabel: 'Create your Jovie account',
    backButtonLabel: 'Back to chat',
    statusRow: <span>Continuing with “Test prompt”</span>,
    children: <SampleForm />,
  },
};
