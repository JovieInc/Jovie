'use client';

import { Button } from '@jovie/ui';
import { Download, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { type CSVColumn, toCSVBlob } from '@/lib/utils/csv';
import {
  downloadCSVBlob,
  generateTimestampedFilename,
} from '@/lib/utils/download';

export interface ExportCSVButtonProps<T extends object> {
  /**
   * Callback to get the data to export.
   * Can be async for lazy loading from an API.
   */
  getData: () => T[] | Promise<T[]>;
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
   * Whether the button is disabled.
   * @default false
   */
  disabled?: boolean;
  /**
   * Custom class name for styling.
   */
  className?: string;
  /**
   * Button variant.
   * @default 'secondary'
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  /**
   * Button size.
   * @default 'sm'
   */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /**
   * Custom button label.
   * @default 'Export CSV'
   */
  label?: string;
  /**
   * Accessible label for screen readers.
   * @default 'Export data to CSV file'
   */
  ariaLabel?: string;
}

/**
 * A reusable button component for exporting data to CSV format.
 * Supports async data fetching, loading states, and customizable styling.
 *
 * @example
 * // Basic usage with static data
 * <ExportCSVButton
 *   getData={() => tableData}
 *   filename="users"
 * />
 *
 * @example
 * // With custom columns and async data
 * <ExportCSVButton
 *   getData={async () => await fetchAllUsers()}
 *   columns={[
 *     { header: 'Name', accessor: 'fullName' },
 *     { header: 'Email', accessor: 'email' },
 *     { header: 'Status', accessor: 'isActive', formatter: (v) => v ? 'Active' : 'Inactive' }
 *   ]}
 *   filename="users-export"
 * />
 */
export function ExportCSVButton<T extends object>({
  getData,
  columns,
  filename = 'export',
  disabled = false,
  className,
  variant = 'secondary',
  size = 'sm',
  label = 'Export CSV',
  ariaLabel = 'Export data to CSV file',
}: ExportCSVButtonProps<T>) {
  const [isExporting, setIsExporting] = useState(false);
  const { error: showError, success: showSuccess } = useNotifications();

  const handleExport = useCallback(async () => {
    if (isExporting || disabled) return;

    setIsExporting(true);

    try {
      // Get data (may be async)
      const data = await Promise.resolve(getData());

      // Validate data
      if (!data || data.length === 0) {
        showError('No data available to export');
        return;
      }

      // Generate CSV blob
      const blob = toCSVBlob(data, { columns });

      // Generate timestamped filename
      const timestampedFilename = generateTimestampedFilename(filename, 'csv');

      // Trigger download
      downloadCSVBlob(blob, timestampedFilename);

      showSuccess(`Exported ${data.length} rows to ${timestampedFilename}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to export CSV';
      showError(message);
    } finally {
      setIsExporting(false);
    }
  }, [
    getData,
    columns,
    filename,
    disabled,
    isExporting,
    showError,
    showSuccess,
  ]);

  return (
    <Button
      variant='outline'
      size={size}
      onClick={handleExport}
      disabled={disabled || isExporting}
      className={cn('gap-2 rounded-lg border-subtle hover:bg-base', className)}
      aria-label={ariaLabel}
      aria-busy={isExporting}
    >
      {isExporting ? (
        <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />
      ) : (
        <Download className='h-4 w-4' aria-hidden='true' />
      )}
      <span>{isExporting ? 'Exporting...' : label}</span>
    </Button>
  );
}
