import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ChatStyleLinkList } from './ChatStyleLinkList';

type ListProps = ComponentProps<typeof ChatStyleLinkList>;

function makeLink(
  id: string,
  name: string,
  category: DetectedLink['platform']['category'],
  url: string
): DetectedLink {
  return {
    platform: {
      id,
      name,
      category,
      icon: id,
      color: '#1ED760',
      placeholder: url,
    },
    normalizedUrl: url,
    originalUrl: url,
    suggestedTitle: name,
    isValid: true,
  };
}

const spotify = makeLink(
  'spotify',
  'Spotify',
  'dsp',
  'https://open.spotify.com/artist/sasha-waves'
);
const appleMusic = makeLink(
  'apple-music',
  'Apple Music',
  'dsp',
  'https://music.apple.com/artist/sasha-waves'
);
const instagram = makeLink(
  'instagram',
  'Instagram',
  'social',
  'https://instagram.com/sashawaves'
);
const venmo = makeLink(
  'venmo',
  'Venmo',
  'earnings',
  'https://venmo.com/u/sasha'
);

const longLink = makeLink(
  'website',
  'The official long-form website of Sasha Waves and the Northern Coastline Orchestra',
  'custom',
  'https://www.sasha-waves-and-the-northern-coastline-orchestra.example.com/tour/2026/europe/spring/tickets-and-vip-packages'
);

/**
 * The list virtualizes against a scroll container its caller owns. It mounts
 * once that container exists, so the virtualizer measures a real element.
 */
function ScrollFrame(props: Readonly<ListProps>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <div
      ref={scrollRef}
      className='h-96 w-full max-w-2xl overflow-y-auto rounded-lg bg-base p-3'
    >
      {mounted ? (
        <ChatStyleLinkList {...props} scrollContainerRef={scrollRef} />
      ) : null}
    </div>
  );
}

function renderInScrollFrame(args: ListProps) {
  return <ScrollFrame {...args} />;
}

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const meta = {
  title: 'Features/Dashboard/Organisms/Links/ChatStyleLinkList States',
  component: ChatStyleLinkList,
  parameters: { layout: 'padded' },
  render: renderInScrollFrame,
  args: {
    links: [instagram, spotify, appleMusic, venmo],
    onLinksChange: fn(),
    onToggle: fn(),
    onRemove: fn(),
    onEdit: fn(),
    openMenuId: null,
    onAnyMenuOpen: fn(),
    lastAddedId: null,
    buildPillLabel: (link: DetectedLink) => link.suggestedTitle,
    addingLink: null,
    pendingPreview: null,
    onAddPendingPreview: fn(),
    onCancelPendingPreview: fn(),
    onHint: fn(),
  },
} satisfies Meta<typeof ChatStyleLinkList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: a link being added shows an Adding row in its own section. */
export const LoadingAddingLink: Story = {
  args: { links: [instagram], addingLink: spotify },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Adding...')).toBeVisible();
    await expect(canvas.getByText('Music service')).toBeVisible();
  },
};

/** Empty: no links, so no section headers or rows render. */
export const EmptyNoLinks: Story = {
  args: { links: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading')).toBeNull();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Long content: a long label and URL truncate inside the row. */
export const LongContentLabelAndUrl: Story = {
  args: { links: [longLink, instagram, spotify, appleMusic, venmo] },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Custom')
    ).toBeVisible();
  },
};

/** Right-to-left: grouped rows inside an RTL document. */
export const RtlLinks: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Social')
    ).toBeVisible();
  },
};
