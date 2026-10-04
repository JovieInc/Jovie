import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPendingToolReader,
  useDesktopChatWorkState,
} from './chat-work-state';
import { useDesktopWorkState } from './session-work-state';

vi.mock('@tanstack/react-query', () => ({ useIsMutating: () => 0 }));
vi.mock('./electron-bridge', () => ({ isDesktopEnvironment: () => true }));
vi.mock('./session-work-state', () => ({ useDesktopWorkState: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('chat work state', () => {
  it('keeps submitted turns, uploads, attachments and drafts unsafe before a stream begins', () => {
    const idle = {
      input: '',
      hasAttachments: false,
      isUploading: false,
      isLoading: false,
      isSubmitting: false,
      isLoadingConversation: false,
      status: 'ready',
      messages: [],
    };
    const { rerender } = renderHook(useDesktopChatWorkState, {
      initialProps: idle,
    });
    expect(useDesktopWorkState).toHaveBeenLastCalledWith({
      hasDraft: false,
      isStreaming: false,
      isUploading: false,
      hasPendingAction: false,
      isAuthenticating: false,
    });
    rerender({ ...idle, status: 'submitted' });
    expect(useDesktopWorkState).toHaveBeenLastCalledWith(
      expect.objectContaining({ isStreaming: true })
    );
    rerender({ ...idle, isSubmitting: true });
    expect(useDesktopWorkState).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasPendingAction: true })
    );
    rerender({ ...idle, hasAttachments: true, isUploading: true });
    expect(useDesktopWorkState).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasDraft: true, isUploading: true })
    );
    rerender({ ...idle, input: 'draft' });
    expect(useDesktopWorkState).toHaveBeenLastCalledWith(
      expect.objectContaining({ hasDraft: true })
    );
  });

  it('protects all outstanding tool states and releases completed/error/denied tools', () => {
    const read = createPendingToolReader();
    for (const state of [
      'input-streaming',
      'input-available',
      'approval-requested',
      'approval-responded',
    ]) {
      expect(read([{ parts: [{ type: 'dynamic-tool', state }] }])).toBe(true);
    }
    for (const state of ['output-available', 'output-error', 'output-denied']) {
      expect(read([{ parts: [{ type: 'tool-action', state }] }])).toBe(false);
    }
  });

  it('reuses completed message work and invalidates a reused parts array by revision', () => {
    const read = createPendingToolReader();
    const type = vi.fn(() => 'tool-action');
    const part = {
      get type() {
        return type();
      },
      state: 'output-available',
    };
    const message = { parts: [part], streamRevision: 1 };
    expect(read([message])).toBe(false);
    type.mockClear();
    expect(read([message, { parts: [{ type: 'text' }] }])).toBe(false);
    expect(type).not.toHaveBeenCalled();
    part.state = 'approval-requested';
    expect(read([{ ...message, streamRevision: 2 }])).toBe(true);
    expect(read([])).toBe(false);
  });
});
