import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: vi.fn(() => ({
    results: [],
    state: 'idle',
    error: null,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
    query: '',
    isPending: false,
  })),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { UniversalLinkInput } from '@/components/dashboard/molecules/universal-link-input';

const stopMock = vi.fn();

class MockMediaRecorder {
  public state: 'inactive' | 'recording' = 'inactive';
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    for (const listener of this.listeners.get('stop') ?? []) {
      listener();
    }
  }
}

describe('UniversalLinkInput voice recording overlay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopMock }],
        }),
      },
    });

    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    });
  });

  it('shows recording overlay, increments duration, and sends voice message placeholder', async () => {
    const onChatSubmit = vi.fn();
    render(
      <UniversalLinkInput
        onAdd={vi.fn()}
        voiceInputEnabled
        chatEnabled
        onChatSubmit={onChatSubmit}
      />
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Start voice input' })
      );
      await Promise.resolve();
    });

    expect(
      screen.getByRole('button', { name: 'Cancel voice recording' })
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText('0:02')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Send voice recording' })
    );

    expect(onChatSubmit).toHaveBeenCalledWith('[Voice message 0:02]');
  });
});
