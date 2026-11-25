import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/components/atoms/SocialIcon', () => {
  const MockSocialIcon = ({ className }: { className?: string }) => (
    <span data-testid='social-icon' className={className} />
  );
  return {
    __esModule: true,
    SocialIcon: MockSocialIcon,
    getPlatformIcon: () => ({ hex: '000000' }),
    getPlatformIconMetadata: () => ({ hex: '000000' }),
  } as unknown as typeof import('@/components/atoms/SocialIcon');
});

// jsdom lays nothing out, so the real virtualizer would window every row away.
// This stand-in keeps its contract (count, estimateSize, offsets) and renders
// every row.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: (index: number) => number;
  }) => {
    let offset = 0;
    const items = Array.from({ length: count }, (_, index) => {
      const size = estimateSize(index);
      const item = { index, key: index, start: offset, size };
      offset += size;
      return item;
    });
    return {
      getVirtualItems: () => items,
      getTotalSize: () => offset,
      measureElement: () => undefined,
    };
  },
}));

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

const instagram = makeLink(
  'instagram',
  'Instagram',
  'social',
  'https://instagram.com/sashawaves'
);
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

/** Owns the scroll container and the open-menu id, as GroupedLinksManager does. */
function Harness(props: Readonly<ListProps>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  return (
    <div ref={scrollRef} data-testid='scroll'>
      <ChatStyleLinkList
        {...props}
        openMenuId={openMenuId}
        onAnyMenuOpen={id => {
          props.onAnyMenuOpen(id);
          setOpenMenuId(id);
        }}
        scrollContainerRef={scrollRef}
      />
    </div>
  );
}

function renderList(overrides: Partial<ListProps> = {}) {
  const handlers = {
    onLinksChange: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onEdit: vi.fn(),
    onAnyMenuOpen: vi.fn(),
    onAddPendingPreview: vi.fn(),
    onCancelPendingPreview: vi.fn(),
    onHint: vi.fn(),
  };
  const view = render(
    <Harness
      links={[instagram, spotify, appleMusic]}
      openMenuId={null}
      lastAddedId={null}
      buildPillLabel={link => link.suggestedTitle}
      addingLink={null}
      pendingPreview={null}
      {...handlers}
      {...overrides}
    />
  );
  return { ...view, ...handlers };
}

// These render full tables and Radix menus; a loaded CI runner needs more than
// the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

describe('ChatStyleLinkList certificate', () => {
  it('groups links under their section headings in section order', async () => {
    const { container } = renderList();

    // Two 32px headers plus three 88px rows.
    expect(container.querySelector('.relative.w-full')).toHaveStyle({
      height: '328px',
    });
    const headings = (await screen.findAllByRole('heading', { level: 3 })).map(
      heading => heading.textContent
    );
    expect(headings).toEqual(['Social', 'Music service']);
    expect(
      screen.getByRole('button', { name: 'Open actions for @sashawaves' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    ).toBeInTheDocument();
    // Only a section with more than one link can be reordered.
    expect(
      screen.getAllByRole('button', { name: 'Drag To Reorder' })
    ).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('routes edit, hide and delete to the index of the row whose menu was opened', async () => {
    const user = userEvent.setup();
    const { container, onEdit, onToggle, onRemove, onAnyMenuOpen } =
      renderList();

    await user.click(
      screen.getByRole('button', { name: 'Open actions for Apple Music' })
    );
    expect(onAnyMenuOpen).toHaveBeenLastCalledWith(
      'apple-music::https://music.apple.com/artist/sasha-waves'
    );
    const menu = await screen.findByRole('menu');
    await expectNoA11yViolations(container);
    await user.click(within(menu).getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(2);

    await user.click(
      screen.getByRole('button', { name: 'Open actions for Spotify' })
    );
    await user.click(
      within(await screen.findByRole('menu')).getByRole('button', {
        name: 'Hide',
      })
    );
    expect(onToggle).toHaveBeenCalledWith(1);

    await user.click(
      screen.getByRole('button', { name: 'Open actions for @sashawaves' })
    );
    await user.click(
      within(await screen.findByRole('menu')).getByRole('button', {
        name: 'Delete',
      })
    );
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('offers to show a hidden link again', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderList({
      links: [{ ...instagram, isVisible: false } as DetectedLink],
    });

    expect(
      screen.queryByRole('button', { name: 'Drag To Reorder' })
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Open actions for @sashawaves' })
    );
    await user.click(
      within(await screen.findByRole('menu')).getByRole('button', {
        name: 'Show',
      })
    );
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('shows an Adding row in the section of the link being added', async () => {
    const { container } = renderList({
      links: [instagram],
      addingLink: spotify,
    });

    expect(await screen.findByText('Adding...')).toBeInTheDocument();
    // The dim lives on the skeleton tile only: an opacity modifier on the
    // row composites the secondary-token text below the 4.5:1 AA floor
    // (axe color-contrast).
    const addingRow = screen.getByText('Adding...').closest('.rounded-lg');
    expect(addingRow).not.toHaveClass('opacity-60');
    expect(addingRow?.querySelector('.skeleton')).toHaveClass('opacity-60');
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map(heading => heading.textContent);
    expect(headings).toEqual(['Social', 'Music service']);
    await expectNoA11yViolations(container);
  });

  it('renders no headings or rows without links', async () => {
    const { container } = renderList({ links: [] });

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
