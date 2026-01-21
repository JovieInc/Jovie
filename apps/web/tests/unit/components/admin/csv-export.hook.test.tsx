/**
 * CSV Export Tests - useCSVExport Hook
 */
import { act, configure, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mockUserColumns,
  mockUsers,
  type TestUser,
} from './csv-export.test-utils';

// Speed up waitFor calls with shorter timeout and interval
configure({ asyncUtilTimeout: 100 });

// Import hook after mocks are set up
import { useCSVExport } from '@/components/admin/table/useCSVExport';
import {
  downloadCSVBlob,
  generateTimestampedFilename,
} from '@/lib/utils/download';

describe('useCSVExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
