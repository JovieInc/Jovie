import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { AudienceMember } from '@/types';
import { AudienceRowActionsMenu } from './AudienceRowActionsMenu';

const member = {
  id: 'member-1',
  type: 'email',
  displayName: 'Ada',
  locationLabel: 'Unknown',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 0,
  intentLevel: 'low',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'ada@example.com',
  emailVisibleToArtist: true,
  phone: '+1 555 0100',
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
} satisfies Partial<AudienceMember>;

/**
 * State coverage for the audience row menu. Same args as the canonical
 * stories (open, non-modal so axe can read the canvas); the error story
 * refuses both clipboard paths so the copy action reports its failure toast.
 */
const meta = {
  title: 'Dashboard/AudienceRowActionsMenu States',
  component: AudienceRowActionsMenu,
  parameters: {
    layout: 'centered',
  },
  args: {
    row: member as AudienceMember,
    open: true,
    modal: false,
    onOpenChange: fn(),
  },
} satisfies Meta<typeof AudienceRowActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the browser refuses the clipboard, so Copy email reports a failure. */
export const ErrorClipboardRefused: Story = {
  beforeEach: () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard'
    );
    const originalExecCommand = document.execCommand;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('Clipboard blocked')),
      },
    });
    document.execCommand = () => false;
    return () => {
      if (originalClipboard)
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      document.execCommand = originalExecCommand;
    };
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole('menuitem', { name: 'Copy email' }));
    await expect(
      body.getByRole('menuitem', { name: 'Copy email' })
    ).toBeVisible();
  },
};
