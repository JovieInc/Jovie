import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { SuggestedActionCard } from './SuggestedActionCard';

const meta: Meta<typeof SuggestedActionCard> = {
  title: 'Features/Connectors/SuggestedActionCard',
  component: SuggestedActionCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SuggestedActionCard>;

const BASE_ACTION = {
  id: 'suggestion',
  title: 'Late Set at Public Records',
  startsAt: '2026-08-22T20:00:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  venueName: 'Public Records',
  city: 'Brooklyn',
  region: 'NY',
  country: 'US',
  rationale: 'The confirmation includes a venue and set time.',
  sourceRef: {
    messageId: 'message-1',
    subject: 'Booking confirmed for August 22',
  },
} as const;

const STATES = [
  { status: 'pending', confidence: 0.96 },
  { status: 'executed', confidence: 0.82 },
  { status: 'failed', confidence: 0.55 },
] as const;

export const StateMatrix: Story = {
  render: () => (
    <div className='grid w-full max-w-5xl gap-3 md:grid-cols-3'>
      {STATES.map(state => (
        <SuggestedActionCard
          key={state.status}
          {...BASE_ACTION}
          id={`${BASE_ACTION.id}-${state.status}`}
          {...state}
          onApprove={fn()}
          onReject={fn()}
        />
      ))}
    </div>
  ),
};

export const SettingsRows: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='min-h-screen bg-surface-1 p-4 text-primary'>
      <SettingsPanel
        title='Suggested Actions'
        bodyClassName='divide-y divide-subtle px-4 sm:px-5'
      >
        <SuggestedActionCard
          {...BASE_ACTION}
          status='pending'
          confidence={null}
          presentation='row'
          reviewHref={APP_ROUTES.DASHBOARD}
        />
        <SuggestedActionCard
          {...BASE_ACTION}
          id='thumbnail'
          kind='youtube.thumbnail_experiment'
          title='Compare approved thumbnails for the next release'
          status='pending'
          confidence={null}
          rationale='Review the approved candidates before starting a YouTube experiment.'
          presentation='row'
          reviewHref={APP_ROUTES.DASHBOARD}
        />
      </SettingsPanel>
    </div>
  ),
};

export const SettingsRowsLight: Story = {
  ...SettingsRows,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'light' } },
};
