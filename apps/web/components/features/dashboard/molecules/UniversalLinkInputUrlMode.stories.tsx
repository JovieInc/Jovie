import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';

const meta = {
  title: 'Features/Dashboard/Molecules/UniversalLinkInputUrlMode',
  component: UniversalLinkInputUrlMode,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'url',
        'placeholder',
        'detectedLink',
        'inputRef',
        'onUrlChange',
        'onKeyDown',
        'onClear',
        'onPlatformSelect',
        'platform',
        'onArtistSearchSelect',
        'onRestoreFocus',
        'disabled',
      ],
    },
  },
} satisfies Meta<typeof UniversalLinkInputUrlMode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
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
};

const baseArgs = Default.args;

export const Empty: Story = { args: { ...baseArgs, voiceInputEnabled: true } };

export const ErrorInvalidLink: Story = {
  args: {
    ...baseArgs,
    url: 'https://example.com/not-a-profile',
    detectedLink: detectPlatform('not a link'),
  },
};

export const LongContentUrl: Story = {
  args: {
    ...baseArgs,
    url: 'https://open.spotify.com/artist/sashawaves?si=a-very-long-tracking-query-string-that-should-scroll-inside-the-field-without-breaking-the-layout',
    detectedLink: detectPlatform('https://open.spotify.com/artist/sashawaves'),
    canSubmit: true,
  },
};

export const OfflineDisabled: Story = {
  args: { ...baseArgs, disabled: true, url: 'https://instagram.com/sasha' },
};

export const PermissionDeniedMic: Story = {
  args: {
    ...baseArgs,
    voiceInputEnabled: true,
    dictationState: 'permission-error',
    onDismissPermissionError: () => {},
  },
};

export const RtlUrl: Story = {
  args: {
    ...baseArgs,
    url: 'https://www.instagram.com/فرقة-منتصف-الليل',
    detectedLink: detectPlatform('https://www.instagram.com/sasha'),
  },
  decorators: [
    function RtlFrame(StoryFn) {
      return (
        <div dir='rtl'>
          <StoryFn />
        </div>
      );
    },
  ],
};

export const PartialDictationProcessing: Story = {
  args: { ...baseArgs, voiceInputEnabled: true, dictationState: 'processing' },
};
