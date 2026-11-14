import { vi } from 'vitest';

/** `useChatFileAttachments` result with nothing attached, for JovieChat mocks. */
export function idleChatFileAttachments() {
  return {
    pendingFiles: [],
    isDragOver: false,
    isUploading: false,
    hasReadyFiles: false,
    addFiles: vi.fn(),
    removeFile: vi.fn(),
    clearFiles: vi.fn(),
    toFileUIParts: () => [],
    dropZoneRef: { current: null },
    accept: 'image/*,audio/*,video/*',
    aggregate: {
      total: 0,
      done: 0,
      uploading: 0,
      queued: 0,
      errors: 0,
      duplicates: 0,
      totalBytes: 0,
      uploadedBytes: 0,
      overallPct: 0,
      speed: '—',
      eta: '—',
    },
  };
}
