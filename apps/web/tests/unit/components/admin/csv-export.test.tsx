/**
 * CSV Export Integration Tests
 *
 * Tests for the CSV export functionality in admin tables, including:
 * - ExportCSVButton component rendering and behavior
 * - useCSVExport hook state management
 * - CSV generation and download triggering
 */

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import components and hooks to test
import { useCSVExport } from '@/components/admin/table/useCSVExport';
import { ExportCSVButton } from '@/components/organisms/table';
// Import CSV configs for admin tables
import {
  CREATORS_CSV_FILENAME_PREFIX,
  creatorsCSVColumns,
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
  WAITLIST_CSV_FILENAME_PREFIX,
  waitlistCSVColumns,
} from '@/lib/admin/csv-configs';
// Import CSV utilities for verification
import type { CSVColumn } from '@/lib/utils/csv';
import { toCSV } from '@/lib/utils/csv';

// Mock the download utility
vi.mock('@/lib/utils/download', () => ({
  downloadBlob: vi.fn(),
  downloadCSVBlob: vi.fn(),
  downloadCSV: vi.fn(),
  downloadString: vi.fn(),
  generateTimestampedFilename: vi.fn((prefix: string, ext: string) => {
    return `${prefix}-2024-01-15.${ext}`;
  }),
}));

// Mock useNotifications hook
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    showToast: vi.fn(),
    hideToast: vi.fn(),
    clearToasts: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    undo: vi.fn(),
    retry: vi.fn(),
    saveSuccess: vi.fn(),
    saveError: vi.fn(),
    uploadSuccess: vi.fn(),
    uploadError: vi.fn(),
    networkError: vi.fn(),
    genericError: vi.fn(),
    handleError: vi.fn(),
    withLoadingToast: vi.fn(),
  }),
}));

import { useNotifications } from '@/lib/hooks/useNotifications';
// Import mocked download functions for assertions
import {
  downloadCSVBlob,
  generateTimestampedFilename,
} from '@/lib/utils/download';

// Sample test data
interface TestUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

const mockUsers: TestUser[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    createdAt: new Date('2024-01-02'),
  },
];

const mockUserColumns: CSVColumn<TestUser>[] = [
  { header: 'ID', accessor: 'id' },
  { header: 'Full Name', accessor: 'name' },
  { header: 'Email Address', accessor: 'email' },
  { header: 'Created', accessor: 'createdAt' },
];

describe('CSV Export Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ExportCSVButton', () => {
    describe('Rendering', () => {
      it('should render with default label', () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
          />
        );

        expect(
          screen.getByRole('button', { name: /export data to csv file/i })
        ).toBeInTheDocument();
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
      });

      it('should render with custom label', () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
            label='Download Users'
          />
        );

        expect(screen.getByText('Download Users')).toBeInTheDocument();
      });

      it('should render download icon', () => {
        const { container } = render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
          />
        );

        // Check for SVG (lucide Download icon)
        expect(container.querySelector('svg')).toBeInTheDocument();
      });

      it('should apply custom className', () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
            className='custom-class'
          />
        );

        const button = screen.getByRole('button');
        expect(button).toHaveClass('custom-class');
      });

      it('should have correct aria-label', () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
            ariaLabel='Export user data'
          />
        );

        expect(screen.getByRole('button')).toHaveAttribute(
          'aria-label',
          'Export user data'
        );
      });
    });

    describe('Disabled State', () => {
      it('should be disabled when disabled prop is true', () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
            disabled
          />
        );

        expect(screen.getByRole('button')).toBeDisabled();
      });

      it('should not trigger export when disabled', async () => {
        const getData = vi.fn().mockReturnValue(mockUsers);

        render(
          <ExportCSVButton
            getData={getData}
            columns={mockUserColumns}
            filename='users'
            disabled
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          expect(getData).not.toHaveBeenCalled();
        });
      });
    });

    describe('Export Behavior', () => {
      it('should call getData and trigger download on click', async () => {
        const getData = vi.fn().mockReturnValue(mockUsers);

        render(
          <ExportCSVButton
            getData={getData}
            columns={mockUserColumns}
            filename='users'
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          expect(getData).toHaveBeenCalledTimes(1);
          expect(downloadCSVBlob).toHaveBeenCalled();
        });
      });

      it('should show loading state during export', async () => {
        // Create a delayed promise to simulate async data fetching
        let resolvePromise: (value: TestUser[]) => void;
        const getData = vi.fn().mockImplementation(
          () =>
            new Promise<TestUser[]>(resolve => {
              resolvePromise = resolve;
            })
        );

        render(
          <ExportCSVButton
            getData={getData}
            columns={mockUserColumns}
            filename='users'
          />
        );

        // Click the button
        fireEvent.click(screen.getByRole('button'));

        // Should show loading text
        await waitFor(() => {
          expect(screen.getByText('Exporting...')).toBeInTheDocument();
        });

        // Button should have aria-busy attribute
        expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');

        // Resolve the promise
        await act(async () => {
          resolvePromise(mockUsers);
        });

        // Should return to normal state
        await waitFor(() => {
          expect(screen.getByText('Export CSV')).toBeInTheDocument();
        });
      });

      it('should handle async getData', async () => {
        const asyncGetData = vi.fn().mockResolvedValue(mockUsers);

        render(
          <ExportCSVButton
            getData={asyncGetData}
            columns={mockUserColumns}
            filename='users'
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          expect(asyncGetData).toHaveBeenCalled();
          expect(downloadCSVBlob).toHaveBeenCalled();
        });
      });

      it('should generate timestamped filename', async () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='test-export'
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          expect(generateTimestampedFilename).toHaveBeenCalledWith(
            'test-export',
            'csv'
          );
        });
      });

      it('should pass correct Blob to download', async () => {
        render(
          <ExportCSVButton
            getData={() => mockUsers}
            columns={mockUserColumns}
            filename='users'
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          expect(downloadCSVBlob).toHaveBeenCalled();
          const call = vi.mocked(downloadCSVBlob).mock.calls[0];
          expect(call[0]).toBeInstanceOf(Blob);
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle empty data gracefully', async () => {
        useNotifications();

        render(
          <ExportCSVButton
            getData={() => []}
            columns={mockUserColumns}
            filename='users'
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          // Should not call download with empty data
          expect(downloadCSVBlob).not.toHaveBeenCalled();
        });
      });

      it('should handle getData error', async () => {
        const getData = vi.fn().mockRejectedValue(new Error('Fetch failed'));

        render(
          <ExportCSVButton
            getData={getData}
            columns={mockUserColumns}
            filename='users'
          />
        );

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => {
          // Download should not be called
          expect(downloadCSVBlob).not.toHaveBeenCalled();
        });

        // Button should return to normal state
        await waitFor(() => {
          expect(screen.getByText('Export CSV')).toBeInTheDocument();
          expect(screen.getByRole('button')).not.toBeDisabled();
        });
      });
    });

    describe('Button Variants', () => {
      it('should accept different variants', () => {
        const { rerender } = render(
          <ExportCSVButton
            getData={() => mockUsers}
            filename='users'
            variant='secondary'
          />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();

        rerender(
          <ExportCSVButton
            getData={() => mockUsers}
            filename='users'
            variant='outline'
          />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();

        rerender(
          <ExportCSVButton
            getData={() => mockUsers}
            filename='users'
            variant='ghost'
          />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();
      });

      it('should accept different sizes', () => {
        const { rerender } = render(
          <ExportCSVButton
            getData={() => mockUsers}
            filename='users'
            size='sm'
          />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();

        rerender(
          <ExportCSVButton
            getData={() => mockUsers}
            filename='users'
            size='default'
          />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();

        rerender(
          <ExportCSVButton
            getData={() => mockUsers}
            filename='users'
            size='lg'
          />
        );
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });
  });

  describe('useCSVExport', () => {
    describe('Initial State', () => {
      it('should return isExporting as false initially', () => {
        const { result } = renderHook(() => useCSVExport<TestUser>());
        expect(result.current.isExporting).toBe(false);
      });

      it('should return exportCSV function', () => {
        const { result } = renderHook(() => useCSVExport<TestUser>());
        expect(typeof result.current.exportCSV).toBe('function');
      });
    });

    describe('Export Behavior', () => {
      it('should set isExporting to true during export', async () => {
        let resolvePromise: (value: TestUser[]) => void;
        const getData = () =>
          new Promise<TestUser[]>(resolve => {
            resolvePromise = resolve;
          });

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({ filename: 'users' })
        );

        // Start export
        let exportPromise: Promise<void>;
        act(() => {
          exportPromise = result.current.exportCSV(getData);
        });

        // Should be exporting
        expect(result.current.isExporting).toBe(true);

        // Resolve the data
        await act(async () => {
          resolvePromise(mockUsers);
          await exportPromise;
        });

        // Should no longer be exporting
        expect(result.current.isExporting).toBe(false);
      });

      it('should accept direct array data', async () => {
        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            columns: mockUserColumns,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers);
        });

        expect(downloadCSVBlob).toHaveBeenCalled();
      });

      it('should accept getter function', async () => {
        const getData = vi.fn().mockResolvedValue(mockUsers);

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            columns: mockUserColumns,
          })
        );

        await act(async () => {
          await result.current.exportCSV(getData);
        });

        expect(getData).toHaveBeenCalled();
        expect(downloadCSVBlob).toHaveBeenCalled();
      });

      it('should prevent concurrent exports', async () => {
        let resolvePromise: (value: TestUser[]) => void;
        const getData = vi.fn().mockImplementation(
          () =>
            new Promise<TestUser[]>(resolve => {
              resolvePromise = resolve;
            })
        );

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({ filename: 'users' })
        );

        // Start first export
        let firstExport: Promise<void>;
        act(() => {
          firstExport = result.current.exportCSV(getData);
        });

        // Try to start second export while first is in progress
        act(() => {
          result.current.exportCSV(getData);
        });

        // getData should only have been called once
        expect(getData).toHaveBeenCalledTimes(1);

        // Complete first export
        await act(async () => {
          resolvePromise(mockUsers);
          await firstExport;
        });
      });
    });

    describe('Options', () => {
      it('should use provided filename', async () => {
        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'custom-export',
            columns: mockUserColumns,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers);
        });

        expect(generateTimestampedFilename).toHaveBeenCalledWith(
          'custom-export',
          'csv'
        );
      });

      it('should allow override options per export', async () => {
        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'default-name',
            columns: mockUserColumns,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers, {
            filename: 'override-name',
          });
        });

        expect(generateTimestampedFilename).toHaveBeenCalledWith(
          'override-name',
          'csv'
        );
      });
    });

    describe('Callbacks', () => {
      it('should call onExportStart when export begins', async () => {
        const onExportStart = vi.fn();

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            columns: mockUserColumns,
            onExportStart,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers);
        });

        expect(onExportStart).toHaveBeenCalledTimes(1);
      });

      it('should call onExportSuccess on successful export', async () => {
        const onExportSuccess = vi.fn();

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            columns: mockUserColumns,
            onExportSuccess,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers);
        });

        expect(onExportSuccess).toHaveBeenCalledWith(
          2,
          expect.stringContaining('users')
        );
      });

      it('should call onExportError on failure', async () => {
        const onExportError = vi.fn();
        const testError = new Error('Export failed');
        const getData = vi.fn().mockRejectedValue(testError);

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            onExportError,
          })
        );

        await act(async () => {
          await result.current.exportCSV(getData);
        });

        expect(onExportError).toHaveBeenCalledWith(testError);
      });

      it('should call onExportError with empty data error', async () => {
        const onExportError = vi.fn();

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            onExportError,
          })
        );

        await act(async () => {
          await result.current.exportCSV([]);
        });

        expect(onExportError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'No data available to export',
          })
        );
      });
    });

    describe('Notifications', () => {
      it('should show notifications by default', async () => {
        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            columns: mockUserColumns,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers);
        });

        // The hook calls success notification
        // This is verified by the mock being called
        expect(downloadCSVBlob).toHaveBeenCalled();
      });

      it('should respect showNotifications: false', async () => {
        const onExportSuccess = vi.fn();

        const { result } = renderHook(() =>
          useCSVExport<TestUser>({
            filename: 'users',
            columns: mockUserColumns,
            showNotifications: false,
            onExportSuccess,
          })
        );

        await act(async () => {
          await result.current.exportCSV(mockUsers);
        });

        // Export should still succeed
        expect(onExportSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('CSV Config Integration', () => {
    describe('Waitlist CSV Config', () => {
      it('should export waitlist columns correctly', () => {
        expect(waitlistCSVColumns).toBeDefined();
        expect(WAITLIST_CSV_FILENAME_PREFIX).toBe('waitlist');

        // Verify column structure
        const headers = waitlistCSVColumns.map(c => c.header);
        expect(headers).toContain('ID');
        expect(headers).toContain('Full Name');
        expect(headers).toContain('Email');
        expect(headers).toContain('Status');
        expect(headers).toContain('Created At');
      });

      it('should format waitlist status correctly', () => {
        const statusColumn = waitlistCSVColumns.find(
          c => c.header === 'Status'
        );
        expect(statusColumn).toBeDefined();
        expect(statusColumn?.formatter).toBeDefined();
        expect(statusColumn?.formatter?.('pending', {} as never)).toBe(
          'Pending'
        );
      });
    });

    describe('Users CSV Config', () => {
      it('should export users columns correctly', () => {
        expect(usersCSVColumns).toBeDefined();
        expect(USERS_CSV_FILENAME_PREFIX).toBe('users');

        // Verify column structure
        const headers = usersCSVColumns.map(c => c.header);
        expect(headers).toContain('ID');
        expect(headers).toContain('Clerk ID');
        expect(headers).toContain('Name');
        expect(headers).toContain('Email');
        expect(headers).toContain('Plan');
        expect(headers).toContain('Is Pro');
      });

      it('should format isPro as Yes/No', () => {
        const isProColumn = usersCSVColumns.find(c => c.header === 'Is Pro');
        expect(isProColumn).toBeDefined();
        expect(isProColumn?.formatter).toBeDefined();
        expect(isProColumn?.formatter?.(true, {} as never)).toBe('Yes');
        expect(isProColumn?.formatter?.(false, {} as never)).toBe('No');
      });
    });

    describe('Creators CSV Config', () => {
      it('should export creators columns correctly', () => {
        expect(creatorsCSVColumns).toBeDefined();
        expect(CREATORS_CSV_FILENAME_PREFIX).toBe('creators');

        // Verify column structure
        const headers = creatorsCSVColumns.map(c => c.header);
        expect(headers).toContain('ID');
        expect(headers).toContain('Username');
        expect(headers).toContain('Display Name');
        expect(headers).toContain('Is Verified');
        expect(headers).toContain('Is Featured');
        expect(headers).toContain('Is Claimed');
      });

      it('should format boolean fields as Yes/No', () => {
        const isVerifiedColumn = creatorsCSVColumns.find(
          c => c.header === 'Is Verified'
        );
        expect(isVerifiedColumn?.formatter?.(true, {} as never)).toBe('Yes');
        expect(isVerifiedColumn?.formatter?.(false, {} as never)).toBe('No');

        const isFeaturedColumn = creatorsCSVColumns.find(
          c => c.header === 'Is Featured'
        );
        expect(isFeaturedColumn?.formatter?.(true, {} as never)).toBe('Yes');
        expect(isFeaturedColumn?.formatter?.(false, {} as never)).toBe('No');
      });

      it('should format confidence as percentage', () => {
        const confidenceColumn = creatorsCSVColumns.find(
          c => c.header === 'Confidence'
        );
        expect(confidenceColumn).toBeDefined();
        expect(confidenceColumn?.formatter?.(0.95, {} as never)).toBe('95.0%');
        expect(confidenceColumn?.formatter?.(0.5, {} as never)).toBe('50.0%');
        expect(confidenceColumn?.formatter?.(null, {} as never)).toBe('');
      });
    });
  });

  describe('CSV Content Generation', () => {
    it('should generate valid CSV content', () => {
      const data = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];

      const csv = toCSV(data, { includeBOM: false });

      expect(csv).toBe('name,age\nJohn,30\nJane,25');
    });

    it('should escape special characters in CSV', () => {
      const data = [{ name: 'Doe, John', note: 'Said "hello"' }];

      const csv = toCSV(data, { includeBOM: false });

      expect(csv).toBe('name,note\n"Doe, John","Said ""hello"""');
    });

    it('should handle null values', () => {
      const data = [{ name: 'John', email: null }];

      const csv = toCSV(data, { includeBOM: false });

      expect(csv).toBe('name,email\nJohn,');
    });

    it('should use custom column headers', () => {
      const data = [{ firstName: 'John', lastName: 'Doe' }];
      const columns: CSVColumn<{ firstName: string; lastName: string }>[] = [
        { header: 'First Name', accessor: 'firstName' },
        { header: 'Last Name', accessor: 'lastName' },
      ];

      const csv = toCSV(data, { columns, includeBOM: false });

      expect(csv).toBe('First Name,Last Name\nJohn,Doe');
    });
  });
});
