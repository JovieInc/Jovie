import type { Meta, StoryObj } from '@storybook/react';

import { ProgressSteps } from './progress-steps';

const meta = {
  title: 'UI/Atoms/ProgressSteps',
  component: ProgressSteps,
  parameters: {
    docs: {
      description: {
        component:
          'Step indicator for multi-step flows. Determinate: list semantics with aria-current="step" on the active step and a polite progress announcement. Indeterminate: reports as an indeterminate progressbar. Fixed 20px markers — completing steps never shifts layout.',
      },
    },
  },
} satisfies Meta<typeof ProgressSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

const STEPS = [
  { id: 'account', label: 'Account' },
  { id: 'connect', label: 'Connect Spotify' },
  { id: 'verify', label: 'Verify identity' },
  { id: 'launch', label: 'Launch profile' },
];

export const Determinate: Story = {
  args: {
    steps: STEPS,
    current: 1,
    'aria-label': 'Profile setup steps',
  },
};

export const Indeterminate: Story = {
  args: {
    steps: STEPS,
    indeterminate: true,
    'aria-label': 'Import steps',
  },
};

export const Failed: Story = {
  args: {
    steps: STEPS,
    current: 1,
    failed: true,
    'aria-label': 'Profile setup steps',
  },
};

export const LongLabels: Story = {
  render: () => (
    <div className='w-96'>
      <ProgressSteps
        steps={[
          {
            id: 'catalog',
            label: 'Match your catalog across every streaming provider',
          },
          {
            id: 'merch',
            label: 'Publish the limited-edition tour collection to your store',
          },
          {
            id: 'audience',
            label: 'Reactivate listeners from your last three releases',
          },
        ]}
        current={1}
        aria-label='Release setup steps'
      />
    </div>
  ),
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <ProgressSteps
        steps={STEPS}
        current={2}
        aria-label='Profile setup steps'
      />
    </div>
  ),
};

export const Narrow: Story = {
  render: () => (
    <div className='w-64'>
      <ProgressSteps
        steps={[
          { id: 'account', label: 'Create your account' },
          { id: 'connect', label: 'Connect Spotify' },
          { id: 'launch', label: 'Launch profile' },
        ]}
        current={0}
        aria-label='Profile setup steps'
      />
    </div>
  ),
};
