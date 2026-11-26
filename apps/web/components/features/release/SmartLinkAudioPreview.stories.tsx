import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkAudioPreview } from './SmartLinkAudioPreview';

const meta = {
  title: 'Features/Release/SmartLinkAudioPreview',
  component: SmartLinkAudioPreview,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    contentId: 'preview-track-1',
    title: 'Never Say A Word',
    artistName: 'Jovie Artist',
    artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    previewUrl: 'https://cdn.example.com/preview.mp3',
  },
} satisfies Meta<typeof SmartLinkAudioPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FallbackSource: Story = {
  args: {
    previewVerification: 'fallback',
    previewSource: 'spotify',
  },
};

export const NoPreview: Story = {
  args: {
    previewUrl: null,
  },
};

export const Empty: Story = {
  args: {
    previewUrl: null,
  },
};

export const Partial: Story = {
  args: {
    artworkUrl: null,
    isrc: null,
    previewVerification: 'fallback',
    previewSource: 'audio_url',
  },
};

export const LongContent: Story = {
  args: {
    title:
      'An Exceptionally Long Track Title That Keeps Going Well Past One Line Of Text',
    artistName: 'An Equally Long Artist Name Collective Featuring Many Guests',
    previewVerification: 'fallback',
    previewSource: 'musicfetch',
  },
};

function RtlDecorator({ children }: { readonly children: React.ReactNode }) {
  return (
    <div dir='rtl' className='w-full max-w-xs'>
      {children}
    </div>
  );
}

export const Rtl: Story = {
  args: {
    title: 'أغنية بعنوان طويل جدا',
    artistName: 'فنان',
  },
  decorators: [
    function WithRtl(StoryComponent) {
      return (
        <RtlDecorator>
          <StoryComponent />
        </RtlDecorator>
      );
    },
  ],
};
