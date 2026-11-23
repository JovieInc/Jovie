import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatFileAttachments } from '@/components/jovie/hooks/useChatFileAttachments';
import { uploadPresignedLazy } from '@/lib/blob/upload-presigned-lazy';

vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => ({ userId: 'user-1' }),
}));

vi.mock('@/lib/blob/upload-presigned-lazy', () => ({
  uploadPresignedLazy: vi.fn(),
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
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('keeps an explicit Blob failure visible and previews a confirmed upload on the supported path', async () => {
    const upload = vi.mocked(uploadPresignedLazy);
    upload.mockRejectedValueOnce(new Error('Vercel Blob upload failed'));
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL() {
          return 'blob:fixture';
        }
        static revokeObjectURL() {}
      }
    );
    const file = new File(['fixture'], 'screenshot.png', { type: 'image/png' });
    const { result, unmount } = renderHook(() =>
      useChatFileAttachments({ onError: vi.fn() })
    );

    act(() => result.current.addFiles([file]));
    await waitFor(() =>
      expect(result.current.pendingFiles[0]).toMatchObject({
        status: 'failed',
        error: 'Vercel Blob upload failed',
      })
    );
    expect(result.current.toFileUIParts()).toEqual([]);
    unmount();

    const path = 'jovie/files/chat/user-1/screenshot.png';
    const blobUrl = `https://fixture.public.blob.vercel-storage.com/${path}`;
    upload.mockResolvedValueOnce({
      pathname: path,
      url: blobUrl,
      contentType: 'image/png',
      downloadUrl: blobUrl,
      contentDisposition: 'inline',
      etag: 'fixture-etag',
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ blobUrl, contentType: 'image/png' }))
    );
    const next = renderHook(() => useChatFileAttachments({ onError: vi.fn() }));
    act(() => next.result.current.addFiles([file]));
    await waitFor(() =>
      expect(next.result.current.pendingFiles[0]).toMatchObject({
        status: 'ready',
        previewUrl: 'blob:fixture',
      })
    );
    expect(next.result.current.toFileUIParts()).toEqual([
      expect.objectContaining({
        type: 'file',
        mediaType: 'image/png',
        url: blobUrl,
      }),
    ]);
    expect(upload).toHaveBeenCalledTimes(2);
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
