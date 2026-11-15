import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { ActionDial, type ActionDialOption } from './ActionDial';

const services: ActionDialOption[] = [
  { id: 'spotify', label: 'Spotify', href: 'https://open.spotify.com' },
  {
    id: 'apple_music',
    label: 'Apple Music',
    href: 'https://music.apple.com',
  },
  { id: 'deezer', label: 'Deezer', href: 'https://www.deezer.com' },
];

function InteractiveDial(args: React.ComponentProps<typeof ActionDial>) {
  const [selectedId, setSelectedId] = useState(args.selectedId);
  return (
    <div className='w-80 rounded-3xl bg-surface-2 p-4'>
      <ActionDial
        {...args}
        selectedId={selectedId}
        onSelect={id => {
          setSelectedId(id);
          args.onSelect(id);
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Release/ActionDial',
  component: ActionDial,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: {
    options: services,
    selectedId: 'spotify',
    onSelect: fn(),
    onActivate: fn(),
    actionLabel: 'Stream Now',
    groupLabel: 'Choose a streaming service',
    hint: 'Swipe to switch. Your choice is remembered.',
  },
  render: args => <InteractiveDial {...args} />,
} satisfies Meta<typeof ActionDial>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifySelected: Story = {};

export const AppleSelected: Story = {
  args: { selectedId: 'apple_music' },
};

export const OneService: Story = {
  args: { options: services.slice(0, 1) },
};

export const DisabledAction: Story = {
  args: { disabled: true },
};

/** With no destinations the dial renders nothing; the host shows its own fallback. */
export const EmptyNoServices: Story = {
  args: { options: [], selectedId: '' },
};

function DspGlyph({
  provider,
}: {
  readonly provider: keyof typeof DSP_LOGO_CONFIG;
}) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      className='h-5 w-5 shrink-0'
      aria-hidden='true'
    >
      <path d={DSP_LOGO_CONFIG[provider]?.iconPath} />
    </svg>
  );
}

/** Some providers have no logo in the registry, so their rows show the name alone. */
export const PartialMissingIcons: Story = {
  args: {
    options: [
      {
        id: 'spotify',
        label: 'Spotify',
        href: 'https://open.spotify.com',
        icon: <DspGlyph provider='spotify' />,
      },
      { id: 'kkbox', label: 'KKBOX', href: 'https://www.kkbox.com' },
      {
        id: 'tidal',
        label: 'TIDAL',
        href: 'https://tidal.com',
        icon: <DspGlyph provider='tidal' />,
      },
      { id: 'jiosaavn', label: 'JioSaavn', href: 'https://www.jiosaavn.com' },
    ],
    selectedId: 'kkbox',
  },
};

const longServices: ActionDialOption[] = [
  'Apple Music Classical (Dolby Atmos Spatial Audio)',
  'Amazon Music Unlimited Ultra HD Family Plan',
  'NetEase Cloud Music International Edition',
  'YouTube Music Premium Offline Downloads',
  'Qobuz Studio Sublime Hi-Res 24-bit Streaming',
  'SoundCloud Go+ Artist Pro Unlimited',
  'Deezer HiFi FLAC Lossless Family',
  'Bandcamp Fan Collection and Wishlist',
  'iHeartRadio All Access Unlimited',
  'Audiomack Supporters Premium Downloads',
  'Pandora Premium Family Plan Stations',
  'Boomplay Music VIP Unlimited Downloads',
].map((label, index) => ({
  id: `service-${index + 1}`,
  label,
  href: `https://example.com/listen/${index + 1}`,
}));

/** Twelve services with long plan names in the narrow dial column. */
export const LongContentServiceNames: Story = {
  args: {
    options: longServices,
    selectedId: 'service-2',
    actionLabel: 'Stream Now',
  },
};

const arabicServices: ActionDialOption[] = [
  {
    id: 'anghami',
    label: 'أنغامي',
    href: 'https://www.anghami.com',
    icon: <DspGlyph provider='anghami' />,
  },
  {
    id: 'spotify',
    label: 'سبوتيفاي',
    href: 'https://open.spotify.com',
    icon: <DspGlyph provider='spotify' />,
  },
  {
    id: 'apple_music',
    label: 'آبل ميوزك',
    href: 'https://music.apple.com',
    icon: <DspGlyph provider='apple_music' />,
  },
  {
    id: 'deezer',
    label: 'ديزر',
    href: 'https://www.deezer.com',
    icon: <DspGlyph provider='deezer' />,
  },
];

/** Arabic service names and copy inside a right-to-left page. */
export const RtlArabic: Story = {
  args: {
    options: arabicServices,
    selectedId: 'anghami',
    actionLabel: 'استمع الآن',
    groupLabel: 'اختر خدمة البث',
    hint: 'اسحب للتبديل. سيتم حفظ اختيارك.',
  },
  render: args => (
    <div dir='rtl' lang='ar'>
      <InteractiveDial {...args} />
    </div>
  ),
};
