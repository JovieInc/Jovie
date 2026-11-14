import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { EmailSignatureInput } from '@/lib/email-signature/build-signature';
import { EmailSignatureDialog } from './EmailSignatureDialog';

const input: EmailSignatureInput = {
  name: 'Sasha Waves',
  handle: 'sashawaves',
  tagline: 'Independent artist',
  avatarUrl: null,
  socials: [
    { label: 'Instagram', url: 'https://instagram.com/sashawaves' },
    { label: 'Spotify', url: 'https://open.spotify.com/artist/sashawaves' },
  ],
  latestRelease: {
    title: 'Skyline Dreams',
    url: 'https://jov.ie/sashawaves/skyline-dreams',
    artworkUrl: null,
  },
};

const meta = {
  title: 'Dashboard/Molecules/EmailSignatureDialog',
  component: EmailSignatureDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onClose: () => {},
    input,
  },
} satisfies Meta<typeof EmailSignatureDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Empty: Story = {
  args: {
    input: null,
  },
};

export const LongContent: Story = {
  args: {
    input: {
      ...input,
      name: 'Sasha Waves and the Midnight Orchestra — International Tour Edition',
      tagline:
        'Independent artists, producers, and collaborators sharing new releases, live sessions, and stories from the road around the world.',
      latestRelease: {
        title:
          'Skyline Dreams: Live From the Midnight Sessions — Deluxe Edition',
        url: 'https://jov.ie/sashawaves/skyline-dreams',
        artworkUrl: null,
      },
    },
  },
};

export const Rtl: Story = {
  // The dialog portals outside the story root, so direction belongs to the page.
  beforeEach: () => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  },
  args: {
    input: {
      ...input,
      name: 'ساشا ويفز وأوركسترا منتصف الليل',
      tagline: 'موسيقى مستقلة وحفلات مباشرة وقصص من الجولة حول العالم',
    },
  },
};
