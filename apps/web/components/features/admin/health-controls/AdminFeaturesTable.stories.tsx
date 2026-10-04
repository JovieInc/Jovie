import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminFeaturesTable } from '@/app/app/(shell)/admin/features/AdminFeaturesTable';

const rows = [
  {
    flagKey: 'spotify_oauth',
    name: 'Spotify OAuth',
    description: 'Connect Spotify accounts through the canonical OAuth flow.',
    defaultEnabled: false,
    dev: null,
    staging: true,
    prod: null,
  },
  {
    flagKey: 'shell_chat_v1',
    name: 'Shell Chat V1',
    description: 'Enable the shell chat surface.',
    defaultEnabled: true,
    dev: false,
    staging: null,
    prod: null,
  },
] as const;

const meta = {
  title: 'Features/Admin/Health Controls/AdminFeaturesTable',
  component: AdminFeaturesTable,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-page p-4'>
        <Story />
      </div>
    ),
  ],
  args: { initialRows: rows, currentTier: 'dev' },
} satisfies Meta<typeof AdminFeaturesTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const LongDescriptions: Story = {
  args: {
    initialRows: rows.map(row => ({
      ...row,
      description:
        'Keep the workspace available while provider connections refresh. ' +
        'This description intentionally spans several lines to verify that full ' +
        'details stay accessible without changing the height of any table row. '.repeat(
          8
        ),
    })),
  },
};

export const LongDescriptionsLight: Story = {
  ...LongDescriptions,
  parameters: { themes: { themeOverride: 'light' } },
};

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
