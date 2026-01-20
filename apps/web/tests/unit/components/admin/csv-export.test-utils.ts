/**
 * Shared test utilities for CSV export tests
 */
import { vi } from 'vitest';

import type { CSVColumn } from '@/lib/utils/csv';

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

// Sample test data interface
export interface TestUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Sample test data
export const mockUsers: TestUser[] = [
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

export const mockUserColumns: CSVColumn<TestUser>[] = [
  { header: 'ID', accessor: 'id' },
  { header: 'Full Name', accessor: 'name' },
  { header: 'Email Address', accessor: 'email' },
  { header: 'Created', accessor: 'createdAt' },
];
