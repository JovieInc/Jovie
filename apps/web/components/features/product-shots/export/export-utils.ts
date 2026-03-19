import { toPng } from 'html-to-image';
import JSZip from 'jszip';

export interface ExportOptions {
  pixelRatio: number;
  backgroundColor?: string;
}

/**
 * Export a DOM element as a PNG blob.
 * Returns a Blob or throws on failure.
 */
export async function exportPng(
  element: HTMLElement,
  options: ExportOptions
): Promise<Blob> {
  const dataUrl = await toPng(element, {
    pixelRatio: options.pixelRatio,
    backgroundColor:
      options.backgroundColor === 'transparent'
        ? undefined
        : options.backgroundColor,
    cacheBust: true,
  });

  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export a single element as a PNG and download it.
 */
export async function exportAndDownloadPng(
  element: HTMLElement,
  filename: string,
  options: ExportOptions
) {
  const blob = await exportPng(element, options);
  downloadBlob(blob, filename);
}

/**
 * Batch export: captures multiple elements sequentially and bundles into a ZIP.
 * Calls onProgress with (completed, total) for progress indication.
 */
export async function exportBatchZip(
  captures: Array<{ element: HTMLElement; filename: string }>,
  options: ExportOptions,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const zip = new JSZip();
  const total = captures.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const { element, filename } = captures[i];
    const blob = await exportPng(element, options);
    zip.file(filename, blob);
    onProgress?.(i + 1, total);
  }

  return zip.generateAsync({ type: 'blob' });
}
