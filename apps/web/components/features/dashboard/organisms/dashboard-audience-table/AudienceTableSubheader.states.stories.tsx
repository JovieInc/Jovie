import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useLayoutEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
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
/** State coverage for the audience toolbar: export failure, long counts, RTL. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/AudienceTableSubheader States',
  component: ExportFixture,
  parameters: {
    layout: 'padded',
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

/** Error: the server refuses the export and the toolbar stays usable. */
export const ErrorExportDenied: Story = {
  args: { denied: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', {
      name: 'Export data to CSV file',
    });
    await userEvent.click(button);
    await expect(button).toBeEnabled();
  },
};

/** Long content: seven-digit counts in the view tabs. */
export const LongContentCounts: Story = {
  args: { subscriberCount: 2_345_678, total: 12_345_678 },
};

/** Right-to-left: the toolbar inside an RTL document. */
export const RtlDocument: Story = {
  args: { subscriberCount: 120, total: 482 },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
