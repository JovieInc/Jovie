import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Utilities
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
      <button onClick={() => nextAddPayload && onAdd(nextAddPayload)}>
        mock-add
      </button>
    ),
  };
});

// dnd-kit minimal mocks to avoid complex interactions in unit tests
vi.mock('@dnd-kit/core', async () => {
  const React = await import('react');
  return {
    DndContext: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    useSensor: vi.fn(),
    useSensors: vi.fn(() => []),
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

// Import after mocks
import { GroupedLinksManager } from '@/components/dashboard/organisms/GroupedLinksManager';

describe('GroupedLinksManager', () => {
  beforeEach(() => {
    nextAddPayload = null;
  });

  it('calls onLinksChange on mount with initial links', () => {
    const onLinksChange = vi.fn();
    render(
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

    render(
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

    render(
      <GroupedLinksManager
        initialLinks={[igSocial()]}
        onLinksChange={onLinksChange}
      />
    );

    // Initial call on mount
    expect(onLinksChange).toHaveBeenCalledTimes(1);

    // Click "Hide" on the first row
    const hideBtn = screen.getByRole('button', { name: /Hide link/i });
    fireEvent.click(hideBtn);

    expect(onLinksChange).toHaveBeenCalledTimes(2);
    const updated = onLinksChange.mock.calls.at(-1)?.[0] as DetectedLink[];
    // Expect isVisible false for the first link
    const vis = (updated[0] as unknown as { isVisible?: boolean }).isVisible;
    expect(vis).toBe(false);
  });
});
