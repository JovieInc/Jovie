'use client';

/**
 * Client-side download utility for triggering browser file downloads.
 * Creates and manages object URLs for Blob downloads with automatic cleanup.
 */

/**
 * Options for file download.
 */
export interface DownloadOptions {
  /** Custom filename for the download. If not provided, uses timestamped default. */
  filename?: string;
  /** MIME type for the content. Defaults to 'text/csv;charset=utf-8'. */
  mimeType?: string;
}

/**
 * Generate a timestamped filename with the given prefix and extension.
 *
 * @param prefix - Prefix for the filename (e.g., 'users', 'waitlist')
 * @param extension - File extension without the dot (e.g., 'csv', 'json')
 * @returns Timestamped filename in format 'prefix-YYYY-MM-DD.ext'
 *
 * @example
 * generateTimestampedFilename('users', 'csv')
 * // Returns: 'users-2024-01-15.csv'
 */
export function generateTimestampedFilename(
  prefix: string,
  extension: string
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const timestamp = `${year}-${month}-${day}`;

  return `${prefix}-${timestamp}.${extension}`;
}

/**
 * Trigger a browser download for a Blob.
 * Creates a temporary object URL, triggers the download, and cleans up.
 *
 * @param blob - The Blob to download
 * @param filename - Filename for the downloaded file
 *
 * @example
 * const blob = new Blob(['Hello, World!'], { type: 'text/plain' });
 * downloadBlob(blob, 'greeting.txt');
 */
export function downloadBlob(blob: Blob, filename: string): void {
  // Create object URL for the blob
  const url = URL.createObjectURL(blob);

  try {
    // Create temporary anchor element
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // Required for Firefox
    link.style.display = 'none';
    document.body.appendChild(link);

    // Trigger download
    link.click();

    // Cleanup anchor element
    link.remove();
  } finally {
    // Revoke object URL to free memory
    // Use setTimeout to ensure download starts before revoking
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }
}

/**
 * Download string content as a file.
 * Converts the string to a Blob and triggers download.
 *
 * @param content - String content to download
 * @param options - Download options
 *
 * @example
 * // Download as CSV
 * downloadString('name,age\nJohn,30', { filename: 'data.csv' });
 *
 * @example
 * // Download as JSON
 * downloadString(JSON.stringify(data), {
 *   filename: 'data.json',
 *   mimeType: 'application/json'
 * });
 */
export function downloadString(
  content: string,
  options: DownloadOptions = {}
): void {
  const {
    filename = generateTimestampedFilename('export', 'txt'),
    mimeType = 'text/plain;charset=utf-8',
  } = options;

  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Download a CSV string as a file.
 * Convenience function for CSV downloads with proper MIME type.
 *
 * @param csvContent - CSV string content to download
 * @param filename - Optional filename (defaults to timestamped 'export-YYYY-MM-DD.csv')
 *
 * @example
 * import { toCSV } from './csv';
 *
 * const csv = toCSV(users, { columns: [...] });
 * downloadCSV(csv, 'users-export.csv');
 */
export function downloadCSV(csvContent: string, filename?: string): void {
  downloadString(csvContent, {
    filename: filename ?? generateTimestampedFilename('export', 'csv'),
    mimeType: 'text/csv;charset=utf-8',
  });
}

/**
 * Download a Blob created from CSV data.
 * Use this with toCSVBlob() for efficient memory handling with large datasets.
 *
 * @param blob - CSV Blob to download (from toCSVBlob)
 * @param filename - Optional filename (defaults to timestamped 'export-YYYY-MM-DD.csv')
 *
 * @example
 * import { toCSVBlob } from './csv';
 *
 * const blob = toCSVBlob(users, { columns: [...] });
 * downloadCSVBlob(blob, 'users-export.csv');
 */
export function downloadCSVBlob(blob: Blob, filename?: string): void {
  downloadBlob(blob, filename ?? generateTimestampedFilename('export', 'csv'));
}
