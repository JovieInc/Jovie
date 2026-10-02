import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
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

  it('keeps aggregate identity on unrelated renders but updates for pending files and quota', async () => {
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ disabled, fileUploadLimit }) =>
        useChatFileAttachments({ onError, disabled, fileUploadLimit }),
      { initialProps: { disabled: false, fileUploadLimit: 0 } }
    );
    const initial = result.current.aggregate;
    const addFiles = result.current.addFiles;
    rerender({ disabled: false, fileUploadLimit: 0 });
    expect(result.current.aggregate).toBe(initial);
    expect(result.current.addFiles).toBe(addFiles);
    await act(async () =>
      result.current.addFiles([
        new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      ])
    );
    expect(result.current.aggregate).not.toBe(initial);
    expect(result.current.aggregate).toMatchObject({
      total: 1,
      locked: 1,
      done: 0,
      overallPct: 0,
    });
    const pending = result.current.aggregate;
    rerender({ disabled: true, fileUploadLimit: 2 });
    expect(result.current.addFiles).not.toBe(addFiles);
    await act(async () =>
      result.current.addFiles([
        new File(['other'], 'other.txt', { type: 'text/plain' }),
      ])
    );
    expect(result.current.pendingFiles).toHaveLength(1);
    expect(result.current.aggregate).toBe(pending);
    act(() => result.current.clearFiles());
    expect(result.current.aggregate).toMatchObject({
      total: 0,
      locked: 0,
      done: 0,
    });
    expect(onError).not.toHaveBeenCalled();
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
