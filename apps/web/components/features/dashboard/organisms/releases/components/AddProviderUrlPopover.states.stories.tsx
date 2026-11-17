import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn, userEvent, within } from 'storybook/test';
import { AddProviderUrlPopover } from './AddProviderUrlPopover';

async function openPopover(canvasElement: HTMLElement, text?: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /link$/ }));
  const page = within(canvasElement.ownerDocument.body);
  const input = await page.findByPlaceholderText('Paste URL here...');
  if (text) await userEvent.type(input, text);
  return page;
}

const meta = {
  title:
    'Features/Dashboard/Organisms/Releases/Components/AddProviderUrlPopover/States',
  component: AddProviderUrlPopover,
  parameters: { layout: 'centered' },
  args: {
    providerLabel: 'Spotify',
    accent: 'var(--color-brand-spotify)',
    providerKey: 'spotify',
    onSave: fn(async () => {}),
  },
} satisfies Meta<typeof AddProviderUrlPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the popover is open with no URL yet, so Save is disabled. */
export const EmptyField: Story = {
  play: async ({ canvasElement }) => {
    await openPopover(canvasElement);
  },
};

/** Error: a link from another domain shows the validation message. */
export const ErrorWrongDomain: Story = {
  play: async ({ canvasElement }) => {
    const page = await openPopover(canvasElement, 'https://example.com/track');
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
  },
};

/** Partial: no provider key, so any URL is accepted without domain checks. */
export const PartialNoProviderKey: Story = {
  args: { providerKey: undefined, providerLabel: 'Bandcamp' },
  play: async ({ canvasElement }) => {
    await openPopover(canvasElement, 'https://artist.example/album');
  },
};

/** Long content: a long provider name and a long pasted URL. */
export const LongContentUrl: Story = {
  args: { providerLabel: 'Amazon Music Unlimited for Artists' },
  play: async ({ canvasElement }) => {
    await openPopover(
      canvasElement,
      'https://music.amazon.com/albums/B0EXAMPLE1234567890?marketplaceId=ATVPDKIKX0DER&musicTerritory=US&ref=dm_sh_release_day'
    );
  },
};

/** Offline: the save is in flight while the network is gone; fields are disabled. */
export const OfflineSaving: Story = {
  args: { isSaving: true },
  play: async ({ canvasElement }) => {
    await openPopover(canvasElement);
  },
};

/** Right-to-left: the popover in an Arabic document direction. */
export const RtlArabicDocument: Story = {
  args: { providerLabel: 'سبوتيفاي' },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    await openPopover(canvasElement);
  },
};
