import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceIntentBadge } from './AudienceIntentBadge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { MatchStatusBadge } from './MatchStatusBadge';

const meta: Meta = {
  title: 'Dashboard/Atoms/StatusBadges',
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj;

function StatusBadgeMatrix() {
  return (
    <div className='flex flex-col gap-6'>
      <section className='flex flex-col gap-2'>
        <p className='text-2xs text-tertiary-token'>Confidence</p>
        <div className='flex flex-wrap items-center gap-2'>
          <ConfidenceBadge score={0.92} />
          <ConfidenceBadge score={0.64} />
          <ConfidenceBadge score={0.31} />
          <ConfidenceBadge score={0.92} showLabel />
        </div>
      </section>
      <section className='flex flex-col gap-2'>
        <p className='text-2xs text-tertiary-token'>Match status</p>
        <div className='flex flex-wrap items-center gap-2'>
          <MatchStatusBadge status='suggested' />
          <MatchStatusBadge status='confirmed' />
          <MatchStatusBadge status='auto_confirmed' />
          <MatchStatusBadge status='rejected' />
        </div>
      </section>
      <section className='flex flex-col gap-2'>
        <p className='text-2xs text-tertiary-token'>Audience intent</p>
        <div className='flex flex-wrap items-center gap-2'>
          <AudienceIntentBadge intentLevel='high' />
          <AudienceIntentBadge intentLevel='medium' />
          <AudienceIntentBadge intentLevel='low' />
        </div>
      </section>
    </div>
  );
}

export const SemanticRoles: Story = {
  render: () => <StatusBadgeMatrix />,
};

export const LongLabels: Story = {
  render: () => (
    <div className='flex max-w-xs flex-wrap items-center gap-2'>
      <MatchStatusBadge status='auto_confirmed' />
      <ConfidenceBadge score={0.88} showLabel />
      <AudienceIntentBadge intentLevel='medium' />
    </div>
  ),
};

export const Light: Story = {
  render: () => <StatusBadgeMatrix />,
  parameters: {
    backgrounds: { default: 'light' },
    themes: { themeOverride: 'light' },
  },
};

export const Dark: Story = {
  render: () => <StatusBadgeMatrix />,
  parameters: {
    backgrounds: { default: 'dark' },
    themes: { themeOverride: 'dark' },
  },
};
