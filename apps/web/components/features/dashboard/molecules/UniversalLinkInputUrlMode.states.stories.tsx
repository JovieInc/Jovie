import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';

const meta = {
  title: 'Features/Dashboard/Molecules/UniversalLinkInputUrlMode/States',
  component: UniversalLinkInputUrlMode,
  parameters: { layout: 'centered' },
  args: {
    url: '',
    placeholder: 'Paste a link',
    detectedLink: null,
    inputRef: { current: null },
    onUrlChange: () => {},
    onKeyDown: () => {},
    onClear: () => {},
    onPlatformSelect: () => {},
    onArtistSearchSelect: () => {},
    onRestoreFocus: () => {},
  },
} satisfies Meta<typeof UniversalLinkInputUrlMode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Partial: Story = {
  args: {
    url: 'https://open.spotify.com/artist/abc',
    detectedLink: detectPlatform('https://open.spotify.com/artist/abc'),
    canSubmit: true,
  },
};

export const Error: Story = {
  args: {
    url: 'not a link',
    detectedLink: {
      ...detectPlatform('https://open.spotify.com/artist/abc'),
      isValid: false,
      error: 'Please check the URL.',
    },
  },
};

export const LongContent: Story = {
  args: {
    url: `https://example.com/${'a-very-long-path-segment/'.repeat(12)}`,
  },
};

export const Offline: Story = {
  args: { disabled: true, url: 'https://example.com' },
};

export const PermissionDenied: Story = {
  args: { voiceInputEnabled: true, dictationState: 'permission-error' },
};

export const RtlOverflow: Story = {
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl' className='w-80'>
          <Story />
        </div>
      );
    },
  ],
  args: { url: 'https://example.com/رابط-طويل-جدا-جدا-جدا-جدا-جدا' },
};
