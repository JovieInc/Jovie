import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  SMART_LINK_HERO_ARTIST_CLASS,
  SMART_LINK_HERO_TITLE_CLASS,
  SmartLinkShell,
} from './SmartLinkShell';

const meta = {
  title: 'Release/SmartLinkShell',
  component: SmartLinkShell,
  parameters: {
    layout: 'centered',
    // Smart link pages render the Noir stage; white text tokens assume it.
    themes: { themeOverride: 'dark' },
    backgrounds: { default: 'dark' },
  },
  args: {
    artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    artworkAlt: 'Never Say A Word artwork',
    // Production shells always carry the brand/menu row; keeping it gives
    // the scrollable viewport focusable content (scrollable-region-focusable).
    showMenuButton: true,
    onMenuOpen: () => undefined,
    children: <p>Listen</p>,
  },
} satisfies Meta<typeof SmartLinkShell>;

export default meta;
export const Default: StoryObj<typeof meta> = {};

type Story = StoryObj<typeof meta>;

const ARTWORK = TIM_WHITE_PROFILE.avatarSrc;

/** No artwork yet: the square frame shows the AudioLines fallback. */
export const EmptyArtwork: Story = {
  args: { artworkUrl: null, artworkAlt: 'Untitled release artwork' },
};

/** Title known, artist line, back link and body copy still missing. */
export const PartialTitleOnly: Story = {
  args: {
    artworkUrl: ARTWORK,
    heroMeta: <h1 className={SMART_LINK_HERO_TITLE_CLASS}>Never Say A Word</h1>,
  },
};

const LONG_TITLE =
  'Never Say A Word (Extended Club Mix featuring The Midnight Strings Orchestra)';

/** A long title and artist wrap below the art without overlapping it. */
export const LongContentTitle: Story = {
  args: {
    artworkUrl: ARTWORK,
    returnHref: '/tim',
    returnLabel: 'Back to Tim White and The Midnight Strings Orchestra',
    heroMeta: (
      <div>
        <h1 className={SMART_LINK_HERO_TITLE_CLASS}>{LONG_TITLE}</h1>
        <span className={SMART_LINK_HERO_ARTIST_CLASS}>
          Tim White, The Midnight Strings Orchestra and Friends
        </span>
      </div>
    ),
  },
};

/** The shell inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    artworkUrl: ARTWORK,
    returnHref: '/tim',
    returnLabel: 'رجوع',
    heroMeta: <h1 className={SMART_LINK_HERO_TITLE_CLASS}>لا تقل كلمة</h1>,
    children: <p>استمع الآن</p>,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
