import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AvailableDSP } from '@/lib/dsp';
import { ListenSection } from './ListenSection';

const mockDSPs: AvailableDSP[] = [
  {
    key: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/example',
    config: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: 'white',
      logoSvg:
        '<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Spotify</title><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0z"/></svg>',
    },
  },
  {
    key: 'apple_music',
    name: 'Apple Music',
    url: 'https://music.apple.com/artist/example',
    config: {
      name: 'Apple Music',
      color: '#FA243C',
      textColor: 'white',
      logoSvg:
        '<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Apple Music</title><path d="M9.455 15.054c-.474 0-.901-.142-1.278-.417"/></svg>',
    },
  },
];

const meta = {
  title: 'Organisms/ListenSection',
  component: ListenSection,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  args: {
    handle: 'tim',
    dsps: mockDSPs,
    savePreferences: false,
    enableTracking: false,
    enableDeepLinks: false,
  },
} satisfies Meta<typeof ListenSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SmallSize: Story = {
  args: {
    size: 'sm',
  },
};

export const NoPreferenceNotice: Story = {
  args: {
    showPreferenceNotice: false,
  },
};
