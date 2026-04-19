import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}));

vi.mock('@/lib/queries/useTrackingMutation', () => ({
  useTrackingMutation: vi.fn(() => ({ mutate: mockMutate })),
}));

const { renderHook, act } = await import('@testing-library/react');
const { useTourDateTicketClick } = await import(
  '@/hooks/useTourDateTicketClick'
);

describe('useTourDateTicketClick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires tracking mutation and opens URL on click', () => {
    const mockOpen = vi.fn();
    vi.stubGlobal('open', mockOpen);

    const { result } = renderHook(() =>
      useTourDateTicketClick(
        'artisthandle',
        'tour-123',
        'https://tickets.com/event'
      )
    );

    const mockEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalledWith({
      handle: 'artisthandle',
      linkType: 'other',
      target: 'https://tickets.com/event',
      context: { contentType: 'tour_date', contentId: 'tour-123' },
    });
    expect(mockOpen).toHaveBeenCalledWith(
      'https://tickets.com/event',
      '_blank',
      'noopener,noreferrer'
    );

    vi.unstubAllGlobals();
  });

  it('does nothing when ticketUrl is null', () => {
    const mockOpen = vi.fn();
    vi.stubGlobal('open', mockOpen);

    const { result } = renderHook(() =>
      useTourDateTicketClick('artisthandle', 'tour-123', null)
    );

    const mockEvent = {
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current(mockEvent);
    });

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
