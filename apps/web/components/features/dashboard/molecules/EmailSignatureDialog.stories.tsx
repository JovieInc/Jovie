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

export const NoInput: Story = {
  args: {
    input: null,
  },
};
