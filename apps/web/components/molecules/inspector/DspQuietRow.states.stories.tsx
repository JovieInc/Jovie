import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DspQuietRow } from './DspQuietRow';

const column: Decorator = function InspectorColumn(Story) {
  return (
    <div className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 max-w-full'>
      <Story />
    </div>
  );
};

/** State coverage for the quiet DSP row; linked and missing rows live in DspQuietRow.stories.tsx. */
const meta = {
  title: 'Molecules/Inspector/DspQuietRow States',
  component: DspQuietRow,
  decorators: [column],
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['closedTabIndex', 'testId'] },
  },
  args: {
    label: 'Spotify',
    href: 'https://open.spotify.com/album/example',
    icon: <ProviderIcon provider='spotify' aria-hidden='true' />,
    onFind: fn(),
    findLabel: 'Find',
  },
} satisfies Meta<typeof DspQuietRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the provider has no saved URL yet, so the row offers Find. */
export const EmptyNoSavedUrl: Story = {
  args: { href: '   ', showUrl: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Find' }));
    await expect(args.onFind).toHaveBeenCalledOnce();
  },
};

/** Long content: a long provider name and a long saved URL truncate in the row. */
export const LongContentTruncatedUrl: Story = {
  args: {
    label: 'Amazon Music Unlimited (Ultra HD and Spatial Audio)',
    href: 'https://music.amazon.com/albums/B0EXAMPLE1234567890?marketplaceId=ATVPDKIKX0DER&musicTerritory=US&ref=dm_sh_extremely_long_reference_tag',
    icon: <ProviderIcon provider='amazon_music' aria-hidden='true' />,
    showUrl: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link')).toHaveTextContent(
      'music.amazon.com/albums'
    );
  },
};

/** Right-to-left: an Arabic provider label in an RTL inspector. */
export const RtlArabic: Story = {
  args: { label: 'سبوتيفاي', showUrl: true },
  decorators: [rtl],
};
