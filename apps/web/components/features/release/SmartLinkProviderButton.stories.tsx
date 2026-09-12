import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SmartLinkProviderButton } from './SmartLinkProviderButton';

const apple = DSP_LOGO_CONFIG.apple_music;
const deezer = DSP_LOGO_CONFIG.deezer;
const spotify = DSP_LOGO_CONFIG.spotify;

const meta = {
  title: 'Release/SmartLinkProviderButton',
  component: SmartLinkProviderButton,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: ['icon', 'className', 'ariaLabel', 'onClick', 'event'],
    },
  },
  args: {
    label: apple.name,
    iconPath: apple.iconPath,
    iconColor: apple.color,
    href: 'https://music.apple.com',
    providerKey: 'apple_music',
  },
} satisfies Meta<typeof SmartLinkProviderButton>;

export default meta;

export const SecondaryRest: StoryObj<typeof meta> = {};

export const SecondaryDisabled: StoryObj<typeof meta> = {
  args: { disabled: true, href: undefined, onClick: () => undefined },
};

export const PrimaryCta: StoryObj<typeof meta> = {
  args: {
    label: 'Stream Now',
    iconPath: spotify.iconPath,
    iconColor: spotify.color,
    href: 'https://open.spotify.com',
    providerKey: 'spotify',
    primary: true,
  },
};

export const SmartLinkStack: StoryObj<typeof meta> = {
  render: () => (
    <div className='flex w-80 flex-col gap-2 rounded-3xl bg-surface-2 p-4'>
      <SmartLinkProviderButton
        label='Stream Now'
        iconPath={spotify.iconPath}
        iconColor={spotify.color}
        href='https://open.spotify.com'
        providerKey='spotify'
        primary
      />
      <SmartLinkProviderButton
        label={apple.name}
        iconPath={apple.iconPath}
        iconColor={apple.color}
        href='https://music.apple.com'
        providerKey='apple_music'
      />
      <SmartLinkProviderButton
        label={deezer.name}
        iconPath={deezer.iconPath}
        iconColor={deezer.color}
        href='https://www.deezer.com'
        providerKey='deezer'
      />
    </div>
  ),
};
