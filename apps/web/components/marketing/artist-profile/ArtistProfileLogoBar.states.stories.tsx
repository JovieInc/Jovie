import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ArtistProfileLogoBar } from './ArtistProfileLogoBar';

/** Rendered states of the logo bar; the default lives in ArtistProfileLogoBar.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileLogoBar States',
  component: ArtistProfileLogoBar,
  parameters: { layout: 'fullscreen' },
  args: {
    proofData: ARTIST_PROFILE_SOCIAL_PROOF,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: ARTIST_PROFILE_COPY.hero.phoneCaption,
    phoneSubcaption: ARTIST_PROFILE_COPY.hero.phoneSubcaption,
    logoPlacement: { page: '/artist-profiles' },
    fixturePermissions: LOGO_PERMISSION_FIXTURES,
  },
} satisfies Meta<typeof ArtistProfileLogoBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no proof logos to show, so only the mode switcher renders. */
export const EmptyLogos: Story = {
  args: { proofData: { ...ARTIST_PROFILE_SOCIAL_PROOF, logos: [] } },
};

/** Permission denied: no brand grant, so the logo strip is withheld. */
export const PermissionDeniedNoGrant: Story = {
  args: { fixturePermissions: [] },
};

/** Long content: a long adaptive body under the mode switcher heading. */
export const LongContentBody: Story = {
  args: {
    adaptive: {
      ...ARTIST_PROFILE_COPY.adaptive,
      body: 'Every mode changes what a listener sees first, from presaves before a drop to tickets on tour, so the profile always points at the next useful action without a second tool to update by hand.',
    },
  },
};

/** Right-to-left: Arabic adaptive copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    adaptive: {
      ...ARTIST_PROFILE_COPY.adaptive,
      body: 'يتغير ما يراه المستمع أولًا مع كل وضع.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
