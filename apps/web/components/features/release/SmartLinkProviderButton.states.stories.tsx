import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SmartLinkProviderButton } from './SmartLinkProviderButton';

const apple = DSP_LOGO_CONFIG.apple_music;

/**
 * Rendered states of the DSP provider row. The rest, disabled and primary
 * rows live in SmartLinkProviderButton.stories.tsx.
 */
const meta = {
  title: 'Release/SmartLinkProviderButton/States',
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
type Story = StoryObj<typeof meta>;

/** Partial: a provider with no icon and no destination yet, shown as a row. */
export const PartialNoIconOrLink: Story = {
  args: {
    label: 'Bandcamp',
    iconPath: undefined,
    iconColor: undefined,
    href: undefined,
    providerKey: 'bandcamp',
  },
};

/** Long content: a provider label long enough to wrap inside the row. */
export const LongContentLabel: Story = {
  args: {
    label: 'Apple Music Classical with Spatial Audio and Lossless Streaming',
  },
  decorators: [
    function NarrowColumn(StoryComponent) {
      return (
        <div className='w-80'>
          <StoryComponent />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic label with the chevron mirrored by the layout. */
export const RtlArabicLabel: Story = {
  args: { label: 'آبل ميوزك', ariaLabel: 'افتح آبل ميوزك' },
  decorators: [
    function RtlDocument(StoryComponent) {
      return (
        <div dir='rtl' lang='ar' className='w-80'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
