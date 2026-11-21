import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
} from './OnboardingToolStatusCards';

const meta = {
  title: 'Features/Onboarding/OnboardingToolStatusCards',
  component: OnboardingHandleCheckCard,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  decorators: [
    Story => (
      <div style={{ width: 640, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OnboardingHandleCheckCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { state: 'input-streaming' },
};

export const Proposed: Story = {
  args: {
    state: 'output-available',
    output: { action: 'check_handle', handle: 'alexexample' },
  },
};

export const ErrorState: Story = {
  args: { state: 'output-error' },
};

export const Rtl: Story = {
  args: {
    state: 'output-available',
    output: { action: 'check_handle', handle: 'alexexample' },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};

export const Empty: Story = {
  args: { state: 'output-available', output: null },
};

export const Partial: Story = {
  render: () => (
    <OnboardingSocialLinkCard
      state='output-available'
      output={{ action: 'propose_social_link', url: 'https://instagram.com' }}
      onAttachAccount={() => {}}
    />
  ),
};

export const LongContent: Story = {
  args: {
    state: 'output-available',
    output: {
      action: 'check_handle',
      handle: 'an.unusually.long.artist.handle.with.many.parts',
    },
  },
};

export const Offline: Story = {
  args: { state: 'output-error', output: { handle: 'alexexample' } },
};

export const PermissionDenied: Story = {
  args: { state: 'output-denied' },
};
