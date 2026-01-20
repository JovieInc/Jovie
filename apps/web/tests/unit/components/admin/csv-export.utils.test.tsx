/**
 * CSV Export Tests - CSV Content Generation
 */
import { configure } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './csv-export.test-utils';

// Speed up waitFor calls with shorter timeout and interval
configure({ asyncUtilTimeout: 100 });

// Import CSV utilities for verification
import type { CSVColumn } from '@/lib/utils/csv';
import { toCSV } from '@/lib/utils/csv';

describe('CSV Content Generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
