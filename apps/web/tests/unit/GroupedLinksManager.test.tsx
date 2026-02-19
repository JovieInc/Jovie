import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Utilities
import { MAX_SOCIAL_LINKS } from '@/constants/app';
import type { DetectedLink } from '@/lib/utils/platform-detection';

// Helper factories
const ytSocial = (overrides: Partial<DetectedLink> = {}): DetectedLink => ({
  platform: {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    icon: 'youtube',
    color: '#ff0000',
    placeholder: 'https://youtube.com/@user',
  },
  normalizedUrl: 'https://youtube.com/@user',
  originalUrl: 'https://youtube.com/@user',
  suggestedTitle: 'YouTube',
  isValid: true,
  ...overrides,
});

const makeSocial = (id: string): DetectedLink => ({
  platform: {
    id,
    name: id,
    category: 'social',
    icon: id,
    color: '#000000',
    placeholder: `https://${id}.com/user`,
  },
  normalizedUrl: `https://${id}.com/user`,
  originalUrl: `https://${id}.com/user`,
  suggestedTitle: id,
  isValid: true,
});

// Note: DSP variant factory omitted until directly needed in tests

const igSocial = (overrides: Partial<DetectedLink> = {}): DetectedLink => ({
  platform: {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: '#C13584',
    placeholder: 'https://instagram.com/user',
  },
  normalizedUrl: 'https://instagram.com/user',
  originalUrl: 'https://instagram.com/user',
  suggestedTitle: 'Instagram',
  isValid: true,
  ...overrides,
});

// Dynamic mocked payload for UniversalLinkInput per test
let nextAddPayload: DetectedLink | null = null;

vi.mock('@/components/dashboard/molecules/UniversalLinkInput', async () => {
  return {
    UniversalLinkInput: ({ onAdd }: { onAdd: (l: DetectedLink) => void }) => (
      <button
        type='button'
        onClick={() => nextAddPayload && onAdd(nextAddPayload)}
      >
        mock-add
      </button>
    ),
  };
});

// dnd-kit minimal mocks to avoid complex interactions in unit tests
vi.mock('@dnd-kit/core', () => {
  return {
    // Simplify DndContext to just render children without real DnD behavior
    DndContext: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    // Provide a no-op PointerSensor so useSensor(PointerSensor, ...) remains valid
    PointerSensor: function PointerSensor() {
      // no-op sensor placeholder for tests
    },
    // Stub sensors to avoid complex behavior in unit tests
    useSensor: vi.fn().mockImplementation((_sensor, options) => ({
      sensor: _sensor,
      options,
    })),
    useSensors: vi.fn().mockImplementation(() => []),
  } as unknown as typeof import('@dnd-kit/core');
});

vi.mock('@dnd-kit/sortable', async () => {
  return {
    SortableContext: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: undefined,
      transition: undefined,
    }),
    arrayMove: (arr: unknown[], from: number, to: number) => {
      const next = arr.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    },
  } as unknown as typeof import('@dnd-kit/sortable');
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// Mock SocialIcon to avoid importing heavy simple-icons payload in this unit test
vi.mock('@/components/atoms/SocialIcon', () => {
  const MockSocialIcon = ({ className }: { className?: string }) => (
    <div data-testid='social-icon' className={className} />
  );

  return {
    __esModule: true,
    SocialIcon: MockSocialIcon,
    getPlatformIcon: () => undefined,
  } as unknown as typeof import('@/components/atoms/SocialIcon');
});

// Import after mocks
import { GroupedLinksManager } from '@/components/dashboard/organisms/GroupedLinksManager';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe.skip('GroupedLinksManager', () => {
  beforeEach(() => {
    nextAddPayload = null;
  });

  it('adds multiple links when clicked quickly (no stale state overwrites)', async () => {
    vi.useFakeTimers();
    const onLinksChange = vi.fn();

    renderWithProviders(
      <GroupedLinksManager initialLinks={[]} onLinksChange={onLinksChange} />
    );

    // ignore initial mount call
    onLinksChange.mockClear();

    nextAddPayload = igSocial({
      normalizedUrl: 'https://instagram.com/a',
      originalUrl: 'https://instagram.com/a',
    });
    fireEvent.click(screen.getByText('mock-add'));

    nextAddPayload = ytSocial({
      platform: {
        ...ytSocial().platform,
        category: 'dsp',
      },
      normalizedUrl: 'https://music.youtube.com/channel/a',
      originalUrl: 'https://music.youtube.com/channel/a',
    });
    fireEvent.click(screen.getByText('mock-add'));

    // handleAdd includes a 600ms delay; advance timers so both complete
    await vi.advanceTimersByTimeAsync(650);

    const last = onLinksChange.mock.calls.at(-1)?.[0] as DetectedLink[];
    expect(last).toHaveLength(2);
    const urls = last.map(l => l.normalizedUrl).sort();
    expect(urls).toEqual(
      ['https://instagram.com/a', 'https://music.youtube.com/channel/a'].sort()
    );

    vi.useRealTimers();
  });

  it('calls onLinksChange on mount with initial links', () => {
    const onLinksChange = vi.fn();
    renderWithProviders(
      <GroupedLinksManager
        initialLinks={[igSocial()]}
        onLinksChange={onLinksChange}
      />
    );
    expect(onLinksChange).toHaveBeenCalledTimes(1);
    expect(onLinksChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('shows YouTube prompt when adding duplicate in same section, and can add to other section', () => {
    const onLinksChange = vi.fn();
    const onLinkAdded = vi.fn();

    renderWithProviders(
      <GroupedLinksManager
        initialLinks={[ytSocial()]}
        onLinksChange={onLinksChange}
        onLinkAdded={onLinkAdded}
      />
    );

    // set payload to same-section YouTube (duplicate)
    nextAddPayload = ytSocial();
    fireEvent.click(screen.getByText('mock-add'));

    // Prompt should appear
    expect(
      screen.getByText(/Do you also want to add it as a music service/i)
    ).toBeInTheDocument();

    // Accept prompt to add as Music
    fireEvent.click(screen.getByRole('button', { name: /Add as Music/i }));

    // onLinkAdded called and onLinksChange fired with 2 links (social + dsp)
    expect(onLinkAdded).toHaveBeenCalledTimes(1);
    expect(onLinksChange).toHaveBeenCalled();
    const last = onLinksChange.mock.calls.at(-1)?.[0] as DetectedLink[];
    expect(last).toHaveLength(2);
    const hasDSP = last.some(
      l => l.platform.id === 'youtube' && l.platform.category === 'dsp'
    );
    expect(hasDSP).toBe(true);
  });

  it('toggles visibility and fires onLinksChange', () => {
    const onLinksChange = vi.fn();

    renderWithProviders(
      <GroupedLinksManager
        initialLinks={[igSocial()]}
        onLinksChange={onLinksChange}
      />
    );

    // Initial call on mount
    expect(onLinksChange).toHaveBeenCalledTimes(1);

    // Open menu and click "Hide" on the first row
    const menuButton = screen.getByRole('button', {
      name: /Open actions for Instagram/i,
    });
    fireEvent.click(menuButton);

    const hideBtn = screen.getByRole('button', { name: /^Hide$/i });
    fireEvent.click(hideBtn);

    expect(onLinksChange).toHaveBeenCalledTimes(2);
    const updated = onLinksChange.mock.calls.at(-1)?.[0] as DetectedLink[];
    // Expect isVisible false for the first link
    const vis = (updated[0] as unknown as { isVisible?: boolean }).isVisible;
    expect(vis).toBe(false);
  });

  it('caps visible social links at MAX_SOCIAL_LINKS and adds new socials as hidden', async () => {
    const onLinksChange = vi.fn();
    vi.useFakeTimers();

    const initial = Array.from({ length: MAX_SOCIAL_LINKS }, (_, i) =>
      makeSocial(`social-${i}`)
    );

    renderWithProviders(
      <GroupedLinksManager
        initialLinks={initial}
        onLinksChange={onLinksChange}
      />
    );

    // ignore initial mount call
    onLinksChange.mockClear();

    nextAddPayload = makeSocial('social-extra');
    fireEvent.click(screen.getByText('mock-add'));

    await vi.advanceTimersByTimeAsync(650);

    expect(onLinksChange).toHaveBeenCalled();
    const latest = onLinksChange.mock.calls.at(-1)?.[0] as DetectedLink[];

    // Should have MAX_SOCIAL_LINKS + 1 total links
    expect(latest).toHaveLength(MAX_SOCIAL_LINKS + 1);

    const socialVisible = latest.filter(l => {
      const category = l.platform.category;
      const visible = (l as unknown as { isVisible?: boolean }).isVisible;
      return category === 'social' && (visible ?? true);
    });

    expect(socialVisible).toHaveLength(MAX_SOCIAL_LINKS);

    const extra = latest.find(l => l.platform.id === 'social-extra');
    const extraVisible =
      (extra as unknown as { isVisible?: boolean }).isVisible ?? true;
    expect(extraVisible).toBe(false);
    vi.useRealTimers();
  });

  it('shows ingested suggestion pills and accepts on click', async () => {
    const onAcceptSuggestion = vi
      .fn()
      .mockResolvedValue(
        igSocial({ normalizedUrl: 'https://instagram.com/artist' })
      );

    renderWithProviders(
      <GroupedLinksManager<DetectedLink>
        initialLinks={[]}
        suggestedLinks={[
          {
            ...igSocial({ normalizedUrl: 'https://instagram.com/artist' }),
            suggestionId: 'suggest-1',
          } as DetectedLink & { suggestionId: string },
        ]}
        onAcceptSuggestion={onAcceptSuggestion}
        suggestionsEnabled
      />
    );

    const pill = screen.getByTestId('ingested-suggestion-pill');
    expect(pill).toHaveTextContent('Instagram');
    expect(pill).toHaveTextContent('@artist');

    fireEvent.click(pill);
    await waitFor(() => {
      expect(onAcceptSuggestion).toHaveBeenCalledTimes(1);
    });
  });

  it('dismisses ingested suggestion pills without triggering accept', async () => {
    const onAcceptSuggestion = vi.fn();
    const onDismissSuggestion = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <GroupedLinksManager<DetectedLink>
        initialLinks={[]}
        suggestedLinks={[
          {
            ...igSocial({ normalizedUrl: 'https://instagram.com/artist' }),
            suggestionId: 'suggest-2',
          } as DetectedLink & { suggestionId: string },
        ]}
        onAcceptSuggestion={onAcceptSuggestion}
        onDismissSuggestion={onDismissSuggestion}
        suggestionsEnabled
      />
    );

    const dismissButton = screen.getByLabelText(
      /Dismiss Instagram suggestion/i
    );
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(onDismissSuggestion).toHaveBeenCalledTimes(1);
    });
    expect(onAcceptSuggestion).not.toHaveBeenCalled();
  });
});
