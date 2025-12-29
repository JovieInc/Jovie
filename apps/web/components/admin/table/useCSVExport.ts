'use client';

import { useCallback, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { type CSVColumn, type CSVOptions, toCSVBlob } from '@/lib/utils/csv';
import {
  downloadCSVBlob,
  generateTimestampedFilename,
} from '@/lib/utils/download';

/**
 * Options for the CSV export hook.
 */
export interface UseCSVExportOptions<T extends object> {
  /**
   * Column configuration for CSV generation.
   * If not provided, all object keys will be used as columns.
   */
  columns?: CSVColumn<T>[];
  /**
   * Base filename for the download (without extension).
   * Will be appended with timestamp: 'filename-YYYY-MM-DD.csv'
   * @default 'export'
   */
  filename?: string;
  /**
   * Date format style for Date values in the CSV.
   * @default 'iso'
   */
  dateFormat?: CSVOptions<T>['dateFormat'];
  /**
   * Callback triggered when export starts.
   */
  onExportStart?: () => void;
  /**
   * Callback triggered when export completes successfully.
   * @param count - Number of rows exported
   * @param filename - The generated filename
   */
  onExportSuccess?: (count: number, filename: string) => void;
  /**
   * Callback triggered when export fails.
   * @param error - The error that occurred
   */
  onExportError?: (error: Error) => void;
  /**
   * Whether to show toast notifications.
   * @default true
   */
  showNotifications?: boolean;
}

/**
 * Result object returned by the useCSVExport hook.
 */
export interface UseCSVExportResult<T extends object> {
  /**
   * Whether an export is currently in progress.
   */
  isExporting: boolean;
  /**
   * Export data to CSV.
   * Accepts either static data or a function that returns data (sync or async).
   *
   * @param getData - Data array or function that returns data
   * @param overrideOptions - Optional overrides for this specific export
   */
  exportCSV: (
    getData: T[] | (() => T[] | Promise<T[]>),
    overrideOptions?: Partial<UseCSVExportOptions<T>>
  ) => Promise<void>;
}

/**
 * A React hook that encapsulates CSV export logic with loading state management.
 *
 * Features:
 * - Loading state (`isExporting`) for UI feedback
 * - Async data fetching support
 * - Configurable columns with type-safe accessors
 * - Toast notifications for success/error states
 * - Customizable filename with automatic timestamps
 * - Lifecycle callbacks (onExportStart, onExportSuccess, onExportError)
 *
 * @param options - Configuration options for the export
 * @returns Object containing `isExporting` state and `exportCSV` function
 *
 * @example
 * // Basic usage with static data
 * const { isExporting, exportCSV } = useCSVExport<User>({
 *   filename: 'users',
 *   columns: [
 *     { header: 'Name', accessor: 'fullName' },
 *     { header: 'Email', accessor: 'email' },
 *   ],
 * });
 *
 * // Export with static data
 * await exportCSV(users);
 *
 * @example
 * // With async data fetching
 * const { isExporting, exportCSV } = useCSVExport<User>({
 *   filename: 'users-export',
 * });
 *
 * // Export with async data
 * await exportCSV(async () => {
 *   const response = await fetch('/api/users');
 *   return response.json();
 * });
 *
 * @example
 * // With custom formatters
 * const { exportCSV } = useCSVExport<User>({
 *   columns: [
 *     { header: 'Name', accessor: 'name' },
 *     {
 *       header: 'Status',
 *       accessor: 'isActive',
 *       formatter: (value) => value ? 'Active' : 'Inactive'
 *     },
 *   ],
 * });
 */
export function useCSVExport<T extends object>(
  options: UseCSVExportOptions<T> = {}
): UseCSVExportResult<T> {
  const {
    columns,
    filename = 'export',
    dateFormat = 'iso',
    onExportStart,
    onExportSuccess,
    onExportError,
    showNotifications = true,
  } = options;

  const [isExporting, setIsExporting] = useState(false);
  const { error: showError, success: showSuccess } = useNotifications();

  const exportCSV = useCallback(
    async (
      getData: T[] | (() => T[] | Promise<T[]>),
      overrideOptions: Partial<UseCSVExportOptions<T>> = {}
    ): Promise<void> => {
      // Prevent concurrent exports
      if (isExporting) {
        return;
      }

      // Merge options with overrides
      const mergedColumns = overrideOptions.columns ?? columns;
      const mergedFilename = overrideOptions.filename ?? filename;
      const mergedDateFormat = overrideOptions.dateFormat ?? dateFormat;
      const mergedShowNotifications =
        overrideOptions.showNotifications ?? showNotifications;

      setIsExporting(true);
      onExportStart?.();

      try {
        // Get data - handle both direct array and getter function
        const data = typeof getData === 'function' ? await getData() : getData;

        // Validate data
        if (!data || data.length === 0) {
          const error = new Error('No data available to export');
          if (mergedShowNotifications) {
            showError('No data available to export');
          }
          onExportError?.(error);
          return;
        }

        // Generate CSV blob
        const blob = toCSVBlob(data, {
          columns: mergedColumns,
          dateFormat: mergedDateFormat,
        });

        // Generate timestamped filename
        const timestampedFilename = generateTimestampedFilename(
          mergedFilename,
          'csv'
        );

        // Trigger download
        downloadCSVBlob(blob, timestampedFilename);

        // Success notifications and callbacks
        if (mergedShowNotifications) {
          showSuccess(`Exported ${data.length} rows to ${timestampedFilename}`);
        }
        onExportSuccess?.(data.length, timestampedFilename);
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to export CSV');

        if (mergedShowNotifications) {
          showError(error.message);
        }
        onExportError?.(error);
      } finally {
        setIsExporting(false);
      }
    },
    [
      isExporting,
      columns,
      filename,
      dateFormat,
      showNotifications,
      onExportStart,
      onExportSuccess,
      onExportError,
      showError,
      showSuccess,
    ]
  );

  return {
    isExporting,
    exportCSV,
  };
}
