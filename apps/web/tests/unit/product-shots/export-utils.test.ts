import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock html-to-image
vi.mock('html-to-image', () => ({
  toPng: vi.fn(),
}));

// Use vi.hoisted so the mock vars are available during vi.mock hoisting
const { mockFile, mockGenerateAsync } = vi.hoisted(() => ({
  mockFile: vi.fn(),
  mockGenerateAsync: vi.fn(),
}));

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file = mockFile;
      generateAsync = mockGenerateAsync;
    },
  };
});

import { toPng } from 'html-to-image';
import {
  downloadBlob,
  exportAndDownloadPng,
  exportBatchZip,
  exportPng,
} from '@/features/product-shots/export/export-utils';

const mockedToPng = vi.mocked(toPng);

const FAKE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQ==';

function makeFakeElement(): HTMLElement {
  return document.createElement('div');
}

describe('exportPng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedToPng.mockResolvedValue(FAKE_DATA_URL);
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['fake'], { type: 'image/png' })),
    });
  });

  it('calls toPng with correct pixelRatio and backgroundColor', async () => {
    const el = makeFakeElement();
    await exportPng(el, { pixelRatio: 3, backgroundColor: '#ff0000' });

    expect(mockedToPng).toHaveBeenCalledWith(el, {
      pixelRatio: 3,
      backgroundColor: '#ff0000',
      cacheBust: true,
    });
  });

  it('passes undefined backgroundColor when transparent', async () => {
    const el = makeFakeElement();
    await exportPng(el, { pixelRatio: 2, backgroundColor: 'transparent' });

    expect(mockedToPng).toHaveBeenCalledWith(el, {
      pixelRatio: 2,
      backgroundColor: undefined,
      cacheBust: true,
    });
  });

  it('returns a Blob', async () => {
    const result = await exportPng(makeFakeElement(), { pixelRatio: 1 });
    expect(result).toBeInstanceOf(Blob);
  });

  it('propagates toPng errors', async () => {
    mockedToPng.mockRejectedValue(new Error('Canvas tainted'));
    await expect(
      exportPng(makeFakeElement(), { pixelRatio: 1 })
    ).rejects.toThrow('Canvas tainted');
  });
});

describe('downloadBlob', () => {
  it('creates an anchor element, clicks it, and revokes the URL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:fake-url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    const blob = new Blob(['test'], { type: 'image/png' });
    downloadBlob(blob, 'test-file.png');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe('A');
    expect(anchor.download).toBe('test-file.png');
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe('exportAndDownloadPng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedToPng.mockResolvedValue(FAKE_DATA_URL);
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['fake'], { type: 'image/png' })),
    });
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('exports and downloads in one call', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    await exportAndDownloadPng(makeFakeElement(), 'output.png', {
      pixelRatio: 2,
    });

    expect(mockedToPng).toHaveBeenCalled();
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('output.png');
    appendSpy.mockRestore();
  });
});

describe('exportBatchZip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedToPng.mockResolvedValue(FAKE_DATA_URL);
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['fake'], { type: 'image/png' })),
    });
    mockGenerateAsync.mockResolvedValue(
      new Blob(['zip'], { type: 'application/zip' })
    );
  });

  it('captures all elements and bundles into ZIP', async () => {
    const captures = [
      { element: makeFakeElement(), filename: 'a.png' },
      { element: makeFakeElement(), filename: 'b.png' },
    ];

    const result = await exportBatchZip(captures, { pixelRatio: 2 });

    expect(mockedToPng).toHaveBeenCalledTimes(2);
    expect(mockFile).toHaveBeenCalledTimes(2);
    expect(mockFile).toHaveBeenCalledWith('a.png', expect.any(Blob));
    expect(mockFile).toHaveBeenCalledWith('b.png', expect.any(Blob));
    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
    expect(result).toBeInstanceOf(Blob);
  });

  it('reports progress', async () => {
    const onProgress = vi.fn();
    const captures = [
      { element: makeFakeElement(), filename: 'a.png' },
      { element: makeFakeElement(), filename: 'b.png' },
      { element: makeFakeElement(), filename: 'c.png' },
    ];

    await exportBatchZip(captures, { pixelRatio: 1 }, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    expect(onProgress).toHaveBeenCalledWith(2, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const captures = [{ element: makeFakeElement(), filename: 'a.png' }];

    await expect(
      exportBatchZip(captures, { pixelRatio: 1 }, undefined, controller.signal)
    ).rejects.toThrow('Aborted');
    expect(mockedToPng).not.toHaveBeenCalled();
  });

  it('handles empty captures array', async () => {
    await exportBatchZip([], { pixelRatio: 1 });
    expect(mockedToPng).not.toHaveBeenCalled();
    expect(mockFile).not.toHaveBeenCalled();
    expect(mockGenerateAsync).toHaveBeenCalledWith({ type: 'blob' });
  });
});
