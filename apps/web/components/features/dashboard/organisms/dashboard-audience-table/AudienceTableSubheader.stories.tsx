import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useLayoutEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { AudienceTableSubheader } from './AudienceTableSubheader';
import { DEFAULT_AUDIENCE_FILTERS } from './types';

const profileId = '11111111-1111-4111-8111-111111111111';
const row = {
  id: profileId,
  email: 'fan@example.com',
  name: 'Demo Fan',
  countryCode: 'US',
  consentedAt: '2026-10-17T00:00:00.000Z',
};

// Deterministic component fixture; no authentication, billing or database writes.
function ExportFixture({
  denied = false,
  ...args
}: ComponentProps<typeof AudienceTableSubheader> & { denied?: boolean }) {
  useLayoutEffect(() => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) =>
      String(input) === '/api/dashboard/audience/subscribers'
        ? Response.json(
            denied
              ? { error: 'Export requires a paid entitlement.' }
              : { rows: [row] },
            { status: denied ? 403 : 200 }
          )
        : original(input, init);
    return () => {
      globalThis.fetch = original;
    };
  }, [denied]);
  return <AudienceTableSubheader {...args} />;
}
const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/AudienceTableSubheader',
  component: ExportFixture,
  parameters: {
    layout: 'padded',
    docs: { story: { inline: false } },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: APP_ROUTES.AUDIENCE },
    },
  },
  args: {
    mode: 'subscribers',
    profileId,
    rows: [],
    selectedIds: new Set<string>(),
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 1,
    total: 1,
    onViewChange: () => undefined,
    onFiltersChange: () => undefined,
  },
} satisfies Meta<typeof ExportFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Subscribers: Story = {};
export const Selected: Story = { args: { selectedIds: new Set([profileId]) } };
export const ServerDenied: Story = { args: { denied: true } };
export const MissingProfile: Story = { args: { profileId: undefined } };
export const Empty: Story = { args: { subscriberCount: 0, total: 0 } };
