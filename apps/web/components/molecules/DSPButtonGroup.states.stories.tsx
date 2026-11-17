import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { AvailableDSP } from '@/lib/dsp';
import { DSPButtonGroup } from './DSPButtonGroup';

const DOT_LOGO =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>';

const dsp = (
  key: string,
  name: string,
  color: string,
  logoSvg = DOT_LOGO
): AvailableDSP => ({
  key,
  name,
  url: `https://example.com/${key}/artist`,
  config: { name, color, textColor: 'white', logoSvg },
});

/** Rendered states of the streaming service list, beside DSPButtonGroup.stories.tsx. */
const meta: Meta<typeof DSPButtonGroup> = {
  title: 'Molecules/DSPButtonGroup States',
  component: DSPButtonGroup,
  parameters: {
    layout: 'centered',
  },
  args: {
    onDSPClick: fn(),
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one service sent no logo, and the notice is hidden. */
export const PartialMissingLogo: Story = {
  args: {
    dsps: [
      dsp('spotify', 'Spotify', '#1DB954'),
      dsp('bandcamp', 'Bandcamp', '#629AA9', ''),
    ],
    showPreferenceNotice: false,
  },
};

/** Long content: every service plus a long custom notice. */
export const ManyServicesLongNotice: Story = {
  args: {
    dsps: [
      dsp('spotify', 'Spotify', '#1DB954'),
      dsp('apple_music', 'Apple Music', '#FA243C'),
      dsp('youtube', 'YouTube Music', '#FF0000'),
      dsp('amazon_music', 'Amazon Music Unlimited HD', '#25D1DA'),
      dsp('deezer', 'Deezer', '#A238FF'),
      dsp('tidal', 'TIDAL', '#000000'),
      dsp('soundcloud', 'SoundCloud', '#FF5500'),
    ],
    preferenceNoticeText:
      'We will remember the service you pick and open it straight away the next time you tap a release link from this artist.',
  },
};

/** Right-to-left: Arabic service names and notice on a right-to-left page. */
export const RtlArabicServices: Story = {
  args: {
    dsps: [
      dsp('anghami', 'أنغامي', '#A020F0'),
      dsp('spotify', 'Spotify', '#1DB954'),
    ],
    preferenceNoticeText: 'سيتم حفظ اختيارك للمرة القادمة',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-80'>
        <Story />
      </div>
    ),
  ],
};
