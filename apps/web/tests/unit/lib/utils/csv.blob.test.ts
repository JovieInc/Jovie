/**
 * CSV Utility Tests - toCSVBlob, UTF8_BOM, and edge cases
 */

import { describe, expect, it } from 'vitest';
import { type CSVColumn, toCSV, toCSVBlob, UTF8_BOM } from '@/lib/utils/csv';

// Polyfill for Blob methods which are not available in the test environment
if (typeof Blob !== 'undefined') {
  if (!Blob.prototype.text) {
    Blob.prototype.text = async function () {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(this);
      });
    };
  }

  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = async function () {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    };
  }
}

describe('CSV Utility - toCSVBlob', () => {
  it('should create a Blob with correct MIME type', () => {
    const data = [{ name: 'John' }];

    const blob = toCSVBlob(data);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/csv;charset=utf-8');
  });

  it('should create a Blob with CSV content', async () => {
    const data = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
    ];

    const blob = toCSVBlob(data, { includeBOM: false });
    const text = await blob.text();

    expect(text).toBe('name,age\nJohn,30\nJane,25');
  });

  it('should include BOM in blob content by default', async () => {
    const data = [{ name: 'Test' }];

    const blob = toCSVBlob(data);
    // Read as arrayBuffer to preserve BOM bytes
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // BOM is EF BB BF in UTF-8
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it('should respect custom column options', async () => {
    const data = [{ firstName: 'John', lastName: 'Doe' }];
    const columns: CSVColumn<{ firstName: string; lastName: string }>[] = [
      {
        header: 'Full Name',
        accessor: row => `${row.firstName} ${row.lastName}`,
      },
    ];

    const blob = toCSVBlob(data, { columns, includeBOM: false });
    const text = await blob.text();

    expect(text).toBe('Full Name\nJohn Doe');
  });
});

describe('CSV Utility - UTF8_BOM constant', () => {
  it('should be the correct BOM character', () => {
    expect(UTF8_BOM).toBe('\uFEFF');
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('CSV Utility - edge cases', () => {
  it('should handle objects with numeric keys', () => {
    const data = [{ '1': 'a', '2': 'b' }];

    const result = toCSV(data, { includeBOM: false });

    expect(result).toBe('1,2\na,b');
  });

  it('should handle values that look like formulas (Excel injection)', () => {
    // Values starting with =, +, -, @ could be interpreted as formulas
    const data = [
      { formula: '=SUM(A1:A10)' },
      { formula: '+1-2' },
      { formula: '-100' },
      { formula: '@mention' },
    ];

    const result = toCSV(data, { includeBOM: false });

    // The current implementation doesn't escape formula characters
    // This test documents current behavior
    expect(result).toContain('=SUM(A1:A10)');
    expect(result).toContain('+1-2');
    expect(result).toContain('-100');
    expect(result).toContain('@mention');
  });

  it('should handle very long string values', () => {
    const longValue = 'a'.repeat(10000);
    const data = [{ text: longValue }];

    const result = toCSV(data, { includeBOM: false });

    expect(result).toBe(`text\n${longValue}`);
  });

  it('should handle values with leading/trailing whitespace', () => {
    const data = [{ text: '  spaced  ' }];

    const result = toCSV(data, { includeBOM: false });

    expect(result).toBe('text\n  spaced  ');
  });

  it('should handle empty string values in arrays', () => {
    const data = [
      { a: '', b: 'value', c: '' },
      { a: 'test', b: '', c: 'end' },
    ];

    const result = toCSV(data, { includeBOM: false });

    expect(result).toBe('a,b,c\n,value,\ntest,,end');
  });
});
