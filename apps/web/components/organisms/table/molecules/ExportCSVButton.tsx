'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  TooltipShortcut,
} from '@jovie/ui';
import { Download, Loader2 } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { type CSVColumn, toCSVBlob } from '@/lib/utils/csv';
import {
  downloadCSVBlob,
  generateTimestampedFilename,
} from '@/lib/utils/download';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
} from './PageToolbar';

export interface ExportCSVButtonProps<T extends object> {
  /**
   * Callback to get the data to export.
   * Can be async for lazy loading from an API.
   */
  readonly getData: () => T[] | Promise<T[]>;
  /** Recheck current authority/consent after confirmation for protected exports. */
  readonly revalidateBeforeDownload?: boolean;
  /**
   * Column configuration for CSV generation.
   * If not provided, all object keys will be used as columns.
   */
  readonly columns?: CSVColumn<T>[];
  /**
   * Base filename for the download (without extension).
   * Will be appended with timestamp: 'filename-YYYY-MM-DD.csv'
   * @default 'export'
   */
  readonly filename?: string;
  /**
   * Whether the button is disabled.
   * @default false
   */
  readonly disabled?: boolean;
  /**
   * Custom class name for styling.
   */
  readonly className?: string;
  /**
   * Button variant.
   * @default 'outline'
   */
  readonly variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  /**
   * Button size.
   * @default 'sm'
   */
  readonly size?: 'default' | 'sm' | 'lg' | 'icon';
  /**
   * Custom button label.
   * @default 'Export CSV'
   */
  readonly label?: string;
  /**
   * Accessible label for screen readers.
   * @default 'Export data to CSV file'
   */
  readonly ariaLabel?: string;
  /**
   * Tooltip label shown on hover. When provided, wraps the button in TooltipShortcut.
   */
  readonly tooltipLabel?: string;
  /**
   * Visual chrome preset for dashboard utility toolbars.
   * @default 'default'
   */
  readonly chrome?: 'default' | 'page-toolbar';
  /**
   * Render toolbar export action as icon-only.
   * @default false
   */
  readonly iconOnly?: boolean;
}

export function ExportCSVButton<T extends object>({
  getData,
  revalidateBeforeDownload = false,
  columns,
  filename = 'export',
  disabled = false,
  className,
  variant = 'outline',
  size = 'sm',
  label = 'Export CSV',
  ariaLabel = 'Export data to CSV file',
  tooltipLabel,
  chrome = 'default',
  iconOnly = false,
}: ExportCSVButtonProps<T>) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingData, setPendingData] = useState<T[] | null>(null);
  const generation = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isDialogOpen && isExporting) {
      dialogRef.current?.focus({ preventScroll: true });
    }
  }, [isDialogOpen, isExporting]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const { error: showError, success: showSuccess } = useNotifications();

  const handleOpenConfirmation = useCallback(async () => {
    if (isExporting || disabled) return;

    setIsExporting(true);
    const requestGeneration = generation.current;

    try {
      const data = await Promise.resolve(getData());
      if (generation.current !== requestGeneration) return;

      if (!data || data.length === 0) {
        showError('No data available to export');
        return;
      }

      setPendingData(data);
      setIsDialogOpen(true);
    } catch (err) {
      if (generation.current !== requestGeneration) return;
      const message =
        err instanceof Error ? err.message : 'Failed to prepare CSV export';
      showError(message);
    } finally {
      if (generation.current === requestGeneration) setIsExporting(false);
    }
  }, [disabled, getData, isExporting, showError]);

  const handleConfirmExport = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      // The controlled dialog owns closing after the authority check completes.
      event.preventDefault();
      if (isExporting || disabled || !pendingData) return;

      setIsExporting(true);
      const requestGeneration = generation.current;

      try {
        const data = revalidateBeforeDownload
          ? await Promise.resolve(getData())
          : pendingData;
        if (generation.current !== requestGeneration) return;
        if (!data || data.length === 0) {
          showError('No data available to export');
          return;
        }
        const blob = toCSVBlob(data, { columns });
        const timestampedFilename = generateTimestampedFilename(
          filename,
          'csv'
        );

        downloadCSVBlob(blob, timestampedFilename);
        showSuccess(`Exported ${data.length} rows to ${timestampedFilename}`);

        setIsDialogOpen(false);
        setPendingData(null);
      } catch (err) {
        if (generation.current !== requestGeneration) return;
        const message =
          err instanceof Error ? err.message : 'Failed to export CSV';
        showError(message);
      } finally {
        if (generation.current === requestGeneration) setIsExporting(false);
      }
    },
    [
      columns,
      getData,
      revalidateBeforeDownload,
      disabled,
      filename,
      isExporting,
      pendingData,
      showError,
      showSuccess,
    ]
  );

  const handleOpenChange = useCallback((open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setPendingData(null);
    }
  }, []);

  const handleCloseAutoFocus = useCallback((event: Event) => {
    // Preparation opens this controlled dialog without a Radix trigger.
    const trigger = triggerRef.current;
    if (!trigger?.isConnected || trigger.disabled) return;
    event.preventDefault();
    trigger.focus({ preventScroll: true });
  }, []);

  const columnCount =
    columns?.length ??
    (pendingData?.[0] ? Object.keys(pendingData[0]).length : 0);

  const button = (
    <Button
      ref={triggerRef}
      variant={variant}
      size={size}
      onClick={handleOpenConfirmation}
      disabled={disabled || isExporting}
      className={cn(
        chrome === 'page-toolbar'
          ? cn(
              PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
              iconOnly && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS
            )
          : APP_CONTROL_BUTTON_CLASS,
        className
      )}
      aria-label={
        iconOnly
          ? ariaLabel
          : `${isExporting ? 'Exporting...' : label} — ${ariaLabel}`
      }
      aria-busy={isExporting}
    >
      {isExporting ? (
        <Loader2
          className={cn(
            chrome === 'page-toolbar' ? PAGE_TOOLBAR_ICON_CLASS : 'h-4 w-4',
            'animate-spin'
          )}
          aria-hidden='true'
        />
      ) : (
        <Download
          className={
            chrome === 'page-toolbar' ? PAGE_TOOLBAR_ICON_CLASS : 'h-4 w-4'
          }
          aria-hidden='true'
        />
      )}
      <span className={cn(iconOnly && 'sr-only')}>
        {isExporting ? 'Exporting...' : label}
      </span>
    </Button>
  );

  return (
    <>
      {tooltipLabel ? (
        <TooltipShortcut label={tooltipLabel} side='bottom'>
          {button}
        </TooltipShortcut>
      ) : (
        button
      )}

      <AlertDialog open={isDialogOpen} onOpenChange={handleOpenChange}>
        <AlertDialogContent
          ref={dialogRef}
          onCloseAutoFocus={handleCloseAutoFocus}
          onEscapeKeyDown={event => {
            if (isExporting) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm CSV export</AlertDialogTitle>
            <AlertDialogDescription>
              Review your export details before downloading.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className='space-y-2 text-app text-secondary-token'>
            <div className='flex items-center justify-between gap-4'>
              <dt>Rows</dt>
              <dd className='font-caption text-primary-token'>
                {pendingData?.length ?? 0}
              </dd>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <dt>Columns</dt>
              <dd className='font-caption text-primary-token'>{columnCount}</dd>
            </div>
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExporting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmExport}
              disabled={isExporting || !pendingData}
              variant='primary'
            >
              {isExporting ? 'Exporting...' : 'Download CSV'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
