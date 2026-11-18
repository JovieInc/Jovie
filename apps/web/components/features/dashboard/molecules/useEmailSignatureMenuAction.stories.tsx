import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import type { EmailSignatureInput } from '@/lib/email-signature/build-signature';
import { useEmailSignatureMenuAction } from './useEmailSignatureMenuAction';

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

/**
 * Renders the hook's overflow action as a plain button beside its modal, the
 * way a drawer header's overflow menu would. `startOpen` opens the preview
 * on mount so its content is visible without a click.
 */
function EmailSignatureMenuActionHarness({
  input: signatureInput,
  startOpen = false,
}: {
  readonly input: EmailSignatureInput | null;
  readonly startOpen?: boolean;
}) {
  const { action, modal, open } = useEmailSignatureMenuAction(signatureInput);
  useEffect(() => {
    if (startOpen) open();
  }, [open, startOpen]);
  const Icon = action.icon;
  return (
    <>
      <Button
        type='button'
        variant='secondary'
        size='sm'
        disabled={action.disabled}
        onClick={action.onClick}
      >
        {Icon ? <Icon className='size-3.5' aria-hidden='true' /> : null}
        {action.label}
      </Button>
      {modal}
    </>
  );
}

const meta = {
  title: 'Dashboard/Molecules/useEmailSignatureMenuAction',
  component: EmailSignatureMenuActionHarness,
  parameters: {
    layout: 'centered',
  },
  args: {
    input,
  },
} satisfies Meta<typeof EmailSignatureMenuActionHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No profile data yet: the menu action is disabled. */
export const UnavailableProfile: Story = {
  args: { input: null },
};

/** Long name, tagline and release title in the opened preview. */
export const LongContentSignature: Story = {
  args: {
    startOpen: true,
    input: {
      ...input,
      name: 'The Extremely Long Artist Name Of A Collective With Many Members',
      handle: 'the-extremely-long-artist-handle-for-a-whole-collective',
      tagline:
        'Independent artist, producer and DJ touring every festival season across Europe, North America and Asia',
      latestRelease: {
        title:
          'A Very Long Deluxe Edition Title With Bonus Tracks, Remixes And A Live Session Recorded On Tour',
        url: 'https://jov.ie/the-extremely-long-artist-handle-for-a-whole-collective/deluxe',
        artworkUrl: null,
      },
    },
  },
};

export const RtlSignature: Story = {
  args: {
    startOpen: true,
    input: {
      ...input,
      name: 'ليلى حداد',
      tagline: 'فنانة مستقلة ومنتجة موسيقية من بيروت',
      latestRelease: {
        title: 'أحلام الأفق',
        url: 'https://jov.ie/sashawaves/skyline-dreams',
        artworkUrl: null,
      },
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
