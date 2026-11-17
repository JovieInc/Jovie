import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { DspLogo } from './DspLogo';

const FEATURED_PROVIDERS = [
  ['spotify', 'Spotify'],
  ['apple_music', 'Apple Music'],
  ['youtube', 'YouTube'],
  ['tidal', 'TIDAL'],
] as const satisfies ReadonlyArray<readonly [ProviderKey, string]>;

const meta = {
  title: 'Atoms/DspLogo',
  component: DspLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    provider: 'spotify',
    height: 20,
  },
} satisfies Meta<typeof DspLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Providers: Story = {
  render: () => (
    <fieldset className='flex flex-wrap items-center gap-4'>
      <legend className='sr-only'>Featured DSP logos</legend>
      {FEATURED_PROVIDERS.map(([provider, label]) => (
        <div className='min-w-24' key={provider}>
          <DspLogo height={20} provider={provider} />
          <span className='sr-only'>{label}</span>
        </div>
      ))}
    </fieldset>
  ),
};

export const AppleMusic: Story = {
  args: {
    provider: 'apple_music',
    height: 24,
  },
};

export const TikTok: Story = {
  args: {
    provider: 'tiktok',
    className: 'text-primary-token',
  },
};

export const Tall: Story = {
  args: {
    height: 32,
    provider: 'spotify',
  },
};

export const UnmappedProvider: Story = {
  args: {
    provider: 'amazon',
  },
};

const LONGEST_PROVIDERS = [
  'netease',
  'youtube_music',
  'amazon_music',
  'iheartradio',
] as const satisfies ReadonlyArray<ProviderKey>;

/**
 * Long content: the longest platform names at a tall size in a narrow cell.
 * The label never wraps, so the caller has to give the logo its full width.
 */
export const LongContentNarrowSlot: Story = {
  render: () => (
    <ul className='flex flex-col gap-3'>
      {LONGEST_PROVIDERS.map(provider => (
        <li className='w-36 border-l border-subtle pl-2' key={provider}>
          <DspLogo height={24} provider={provider} />
        </li>
      ))}
    </ul>
  ),
};

/** Right-to-left: platform logos beside Arabic listen-on labels. */
export const RtlListenOn: Story = {
  render: () => (
    <ul dir='rtl' className='flex flex-col gap-3 text-sm text-secondary-token'>
      {(
        [
          ['anghami', 'استمع على'],
          ['spotify', 'استمع على'],
          ['deezer', 'متوفر الآن على'],
        ] as const
      ).map(([provider, label]) => (
        <li className='flex items-center gap-2' key={provider}>
          <span>{label}</span>
          <DspLogo height={20} provider={provider} />
        </li>
      ))}
    </ul>
  ),
};
