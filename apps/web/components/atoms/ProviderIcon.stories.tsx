import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProviderIcon } from './ProviderIcon';

const meta = {
  title: 'Atoms/ProviderIcon',
  component: ProviderIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    provider: 'spotify',
  },
} satisfies Meta<typeof ProviderIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const DSP_PROVIDERS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'tidal',
  'deezer',
] as const;

export const DSPRow: Story = {
  name: 'DSP row',
  render: () => (
    <fieldset className='flex items-center gap-4'>
      <legend className='sr-only'>Streaming providers</legend>
      {DSP_PROVIDERS.map(provider => (
        <ProviderIcon
          key={provider}
          provider={provider}
          className='h-6 w-6'
          aria-label={provider}
        />
      ))}
    </fieldset>
  ),
};

export const UnknownProvider: Story = {
  name: 'Unknown provider (fallback)',
  args: {
    // @ts-expect-error — exercising the not-found fallback path.
    provider: 'unknown-provider',
    'aria-label': 'Unknown provider',
  },
};
