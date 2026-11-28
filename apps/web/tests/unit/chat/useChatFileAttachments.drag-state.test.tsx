import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatFileAttachments } from '@/components/jovie/hooks/useChatFileAttachments';

vi.mock('@/hooks/useJovieAuth', () => ({
  useAuthSafe: () => ({ userId: 'user-1' }),
}));

const uploadMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/blob/upload-presigned-lazy', () => ({
  uploadPresignedLazy: uploadMock,
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
  beforeEach(() => uploadMock.mockReset());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('clears staged attachments when the conversation changes', async () => {
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useChatFileAttachments({ onError, fileUploadLimit: 0, resetKey }),
      { initialProps: { resetKey: 'thread-a' } }
    );
    await act(async () =>
      result.current.addFiles([
        new File(['notes'], 'notes.txt', { type: 'text/plain' }),
      ])
    );
    expect(result.current.pendingFiles).toHaveLength(1);
    rerender({ resetKey: 'thread-b' });
    expect(result.current.pendingFiles).toHaveLength(0);
    expect(result.current.isUploading).toBe(false);
  });

  it('aborts old uploads and ignores late audio callbacks after a thread switch', async () => {
    let finishOldUpload!: (value: { url: string; pathname: string }) => void;
    let finishNewUpload!: (value: { url: string; pathname: string }) => void;
    uploadMock
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishOldUpload = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishNewUpload = resolve;
          })
      );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url === '/api/chat/audio'
                ? {
                    previewUrl: 'https://files.example.test/old.mp3',
                    prompt: 'Old audio prompt',
                    inference: {},
                  }
                : {
                    blobUrl: 'https://files.example.test/new.txt',
                    contentType: 'text/plain',
                  }
            )
          )
      )
    );
    const onAudioUploaded = vi.fn();
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useChatFileAttachments({ onError, onAudioUploaded, resetKey }),
      { initialProps: { resetKey: 'thread-a' } }
    );
    await act(async () =>
      result.current.addFiles([
        new File(['audio'], 'old.mp3', { type: 'audio/mpeg' }),
      ])
    );
    expect(result.current.isUploading).toBe(true);
    const oldSignal = uploadMock.mock.calls[0][2].abortSignal as AbortSignal;
    rerender({ resetKey: 'thread-b' });
    expect(oldSignal.aborted).toBe(true);
    await act(async () =>
      result.current.addFiles([
        new File(['notes'], 'new.txt', { type: 'text/plain' }),
      ])
    );
    await act(async () =>
      finishOldUpload({
        url: 'https://files.example.test/old.mp3',
        pathname: 'chat/old.mp3',
      })
    );
    expect(onAudioUploaded).not.toHaveBeenCalled();
    expect(result.current.pendingFiles.map(file => file.name)).toEqual([
      'new.txt',
    ]);
    expect(result.current.isUploading).toBe(true);
    await act(async () =>
      finishNewUpload({
        url: 'https://files.example.test/new.txt',
        pathname: 'chat/new.txt',
      })
    );
    expect(result.current.isUploading).toBe(false);
    expect(result.current.toFileUIParts()).toEqual([
      {
        type: 'file',
        mediaType: 'text/plain',
        url: 'https://files.example.test/new.txt',
      },
    ]);
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
