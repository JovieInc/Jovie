import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatFileAttachments } from '@/components/jovie/hooks/useChatFileAttachments';

vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => ({ userId: 'user-1' }),
}));

vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(),
}));

function DragHarness({
  resetKey = null,
}: {
  readonly resetKey?: string | null;
}) {
  const { isDragOver, dropZoneRef } = useChatFileAttachments({
    onError: vi.fn(),
    resetKey,
  });

  return (
    <div ref={dropZoneRef} data-testid='drop-zone'>
      {isDragOver ? 'over' : 'idle'}
    </div>
  );
}

function enterFileDrag(target: Element) {
  fireEvent.dragEnter(target, {
    dataTransfer: { types: ['Files'] },
  });
}

describe('useChatFileAttachments drag state (JOV-5413)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enters drag-over on file dragenter and clears on dragleave', () => {
    render(<DragHarness />);
    const zone = screen.getByTestId('drop-zone');

    expect(zone).toHaveTextContent('idle');
    enterFileDrag(zone);
    expect(zone).toHaveTextContent('over');

    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    expect(zone).toHaveTextContent('idle');
  });

  it('clears drag-over on drop', () => {
    render(<DragHarness />);
    const zone = screen.getByTestId('drop-zone');

    enterFileDrag(zone);
    expect(zone).toHaveTextContent('over');

    fireEvent.drop(zone, {
      dataTransfer: { types: ['Files'], files: [] },
    });
    expect(zone).toHaveTextContent('idle');
  });

  it('clears drag-over on Escape and window dragend', () => {
    render(<DragHarness />);
    const zone = screen.getByTestId('drop-zone');

    enterFileDrag(zone);
    expect(zone).toHaveTextContent('over');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(zone).toHaveTextContent('idle');

    enterFileDrag(zone);
    expect(zone).toHaveTextContent('over');

    fireEvent.dragEnd(window);
    expect(zone).toHaveTextContent('idle');
  });

  it('clears drag-over on navigation resetKey', () => {
    const { rerender } = render(<DragHarness resetKey='thread-a' />);
    const zone = screen.getByTestId('drop-zone');

    enterFileDrag(zone);
    expect(zone).toHaveTextContent('over');

    rerender(<DragHarness resetKey='thread-b' />);
    expect(screen.getByTestId('drop-zone')).toHaveTextContent('idle');
  });
});
