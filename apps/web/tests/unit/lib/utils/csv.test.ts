/**
 * CSV Utility Tests
 * Comprehensive unit tests for the CSV conversion utility
 */

import { describe, expect, it } from 'vitest';
import {
  type CSVColumn,
  escapeCSVValue,
  formatDateValue,
  toCSV,
  toCSVBlob,
  UTF8_BOM,
} from '@/lib/utils/csv';

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

describe('CSV Utility', () => {
  describe('escapeCSVValue', () => {
    describe('null and undefined handling', () => {
      it('should return empty string for null', () => {
        expect(escapeCSVValue(null)).toBe('');
      });

      it('should return empty string for undefined', () => {
        expect(escapeCSVValue(undefined)).toBe('');
      });
    });

    describe('basic value conversion', () => {
      it('should convert string to string', () => {
        expect(escapeCSVValue('hello')).toBe('hello');
      });

      it('should convert number to string', () => {
        expect(escapeCSVValue(42)).toBe('42');
        expect(escapeCSVValue(3.14)).toBe('3.14');
        expect(escapeCSVValue(-100)).toBe('-100');
      });

      it('should convert boolean to string', () => {
        expect(escapeCSVValue(true)).toBe('true');
        expect(escapeCSVValue(false)).toBe('false');
      });

      it('should convert 0 to string', () => {
        expect(escapeCSVValue(0)).toBe('0');
      });

      it('should convert empty string to empty string', () => {
        expect(escapeCSVValue('')).toBe('');
      });
    });

    describe('special character escaping', () => {
      it('should quote and escape values containing commas', () => {
        expect(escapeCSVValue('hello, world')).toBe('"hello, world"');
      });

      it('should quote and escape values containing double quotes', () => {
        expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""');
      });

      it('should quote and escape values containing newlines', () => {
        expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
      });

      it('should quote and escape values containing carriage returns', () => {
        expect(escapeCSVValue('line1\rline2')).toBe('"line1\rline2"');
      });

      it('should handle values with multiple special characters', () => {
        const value = 'He said, "Hello\nWorld"';
        expect(escapeCSVValue(value)).toBe('"He said, ""Hello\nWorld"""');
      });

      it('should not quote values without special characters', () => {
        expect(escapeCSVValue('normal text')).toBe('normal text');
      });

      it('should handle values with only double quotes correctly', () => {
        expect(escapeCSVValue('""')).toBe('""""""');
      });
    });

    describe('unicode and special characters', () => {
      it('should handle unicode characters without quoting', () => {
        expect(escapeCSVValue('日本語')).toBe('日本語');
      });

      it('should handle emojis', () => {
        expect(escapeCSVValue('Hello 👋')).toBe('Hello 👋');
      });

      it('should handle unicode with special CSV characters', () => {
        expect(escapeCSVValue('日本語, with comma')).toBe(
          '"日本語, with comma"'
        );
      });
    });
  });

  describe('formatDateValue', () => {
    it('should format date as ISO string by default', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(formatDateValue(date)).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should format date as ISO string when format is iso', () => {
      const date = new Date('2024-06-20T15:45:30Z');
      expect(formatDateValue(date, 'iso')).toBe('2024-06-20T15:45:30.000Z');
    });

    it('should format date as locale string when format is locale', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDateValue(date, 'locale');
      // Locale string format varies, just verify it's not empty and different from ISO
      expect(result).toBeTruthy();
      expect(result).not.toBe('');
    });

    it('should return empty string for invalid date', () => {
      const invalidDate = new Date('invalid');
      expect(formatDateValue(invalidDate)).toBe('');
    });

    it('should return empty string for non-Date object', () => {
      // Test the type guard
      expect(formatDateValue('2024-01-15' as unknown as Date)).toBe('');
      expect(formatDateValue(12345 as unknown as Date)).toBe('');
    });
  });

  describe('toCSV', () => {
    describe('basic array to CSV conversion', () => {
      it('should convert simple array of objects to CSV', () => {
        const data = [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('name,age\nJohn,30\nJane,25');
      });

      it('should include BOM by default', () => {
        const data = [{ name: 'John' }];

        const result = toCSV(data);

        expect(result.startsWith(UTF8_BOM)).toBe(true);
      });

      it('should exclude BOM when includeBOM is false', () => {
        const data = [{ name: 'John' }];

        const result = toCSV(data, { includeBOM: false });

        expect(result.startsWith(UTF8_BOM)).toBe(false);
      });

      it('should handle single row data', () => {
        const data = [{ id: 1, value: 'test' }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('id,value\n1,test');
      });
    });

    describe('empty arrays', () => {
      it('should return empty string with BOM for empty array without columns', () => {
        const data: object[] = [];

        const result = toCSV(data);

        expect(result).toBe(UTF8_BOM);
      });

      it('should return empty string without BOM when includeBOM is false', () => {
        const data: object[] = [];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('');
      });

      it('should return header row for empty array with columns defined', () => {
        const data: { name: string; email: string }[] = [];
        const columns: CSVColumn<{ name: string; email: string }>[] = [
          { header: 'Name', accessor: 'name' },
          { header: 'Email', accessor: 'email' },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Name,Email');
      });
    });

    describe('null and undefined handling', () => {
      it('should convert null values to empty strings', () => {
        const data = [{ name: 'John', value: null }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('name,value\nJohn,');
      });

      it('should convert undefined values to empty strings', () => {
        const data = [{ name: 'John', value: undefined }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('name,value\nJohn,');
      });

      it('should handle mixed null/undefined values', () => {
        const data = [
          { a: 1, b: null, c: undefined },
          { a: 2, b: 'value', c: 'test' },
        ];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('a,b,c\n1,,\n2,value,test');
      });
    });

    describe('special character escaping in CSV', () => {
      it('should escape commas in values', () => {
        const data = [{ name: 'Doe, John', age: 30 }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('name,age\n"Doe, John",30');
      });

      it('should escape quotes in values', () => {
        const data = [{ message: 'He said "hello"' }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('message\n"He said ""hello"""');
      });

      it('should escape newlines in values', () => {
        const data = [{ text: 'line1\nline2' }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('text\n"line1\nline2"');
      });

      it('should escape special characters in headers', () => {
        const data = [{ value: 'test' }];
        const columns: CSVColumn<{ value: string }>[] = [
          { header: 'Value, with comma', accessor: 'value' },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('"Value, with comma"\ntest');
      });
    });

    describe('Date formatting', () => {
      it('should format Date objects as ISO strings by default', () => {
        const date = new Date('2024-03-15T12:00:00Z');
        const data = [{ name: 'Event', date }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('name,date\nEvent,2024-03-15T12:00:00.000Z');
      });

      it('should format Date objects as locale strings when specified', () => {
        const date = new Date('2024-03-15T12:00:00Z');
        const data = [{ name: 'Event', date }];

        const result = toCSV(data, { includeBOM: false, dateFormat: 'locale' });

        expect(result).toContain('name,date');
        expect(result).toContain('Event');
        // Locale format varies by environment, just check it doesn't use ISO format
        expect(result).not.toContain('2024-03-15T12:00:00.000Z');
      });

      it('should handle multiple dates in data', () => {
        const data = [
          { event: 'Start', date: new Date('2024-01-01T00:00:00Z') },
          { event: 'End', date: new Date('2024-12-31T23:59:59Z') },
        ];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe(
          'event,date\nStart,2024-01-01T00:00:00.000Z\nEnd,2024-12-31T23:59:59.000Z'
        );
      });
    });

    describe('custom column configuration', () => {
      it('should use custom headers', () => {
        const data = [{ firstName: 'John', lastName: 'Doe' }];
        const columns: CSVColumn<{ firstName: string; lastName: string }>[] = [
          { header: 'First Name', accessor: 'firstName' },
          { header: 'Last Name', accessor: 'lastName' },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('First Name,Last Name\nJohn,Doe');
      });

      it('should use function accessors', () => {
        const data = [{ firstName: 'John', lastName: 'Doe' }];
        const columns: CSVColumn<{ firstName: string; lastName: string }>[] = [
          {
            header: 'Full Name',
            accessor: row => `${row.firstName} ${row.lastName}`,
          },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Full Name\nJohn Doe');
      });

      it('should use custom formatters', () => {
        const data = [{ name: 'John', active: true }];
        const columns: CSVColumn<{ name: string; active: boolean }>[] = [
          { header: 'Name', accessor: 'name' },
          {
            header: 'Status',
            accessor: 'active',
            formatter: value => (value ? 'Active' : 'Inactive'),
          },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Name,Status\nJohn,Active');
      });

      it('should pass row to formatter function', () => {
        const data = [
          { price: 100, currency: 'USD' },
          { price: 200, currency: 'EUR' },
        ];
        const columns: CSVColumn<{ price: number; currency: string }>[] = [
          {
            header: 'Amount',
            accessor: 'price',
            formatter: (value, row) => `${row.currency} ${value}`,
          },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Amount\nUSD 100\nEUR 200');
      });

      it('should select only specified columns', () => {
        const data = [
          { id: 1, name: 'John', email: 'john@example.com', age: 30 },
        ];
        const columns: CSVColumn<{
          id: number;
          name: string;
          email: string;
          age: number;
        }>[] = [
          { header: 'Name', accessor: 'name' },
          { header: 'Email', accessor: 'email' },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Name,Email\nJohn,john@example.com');
        expect(result).not.toContain('id');
        expect(result).not.toContain('age');
      });

      it('should handle formatter returning value with special characters', () => {
        const data = [{ items: ['a', 'b', 'c'] }];
        const columns: CSVColumn<{ items: string[] }>[] = [
          {
            header: 'Items',
            accessor: 'items',
            formatter: value => (value as string[]).join(', '),
          },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Items\n"a, b, c"');
      });

      it('should handle formatter with Date values', () => {
        const data = [{ created: new Date('2024-06-15T10:30:00Z') }];
        const columns: CSVColumn<{ created: Date }>[] = [
          {
            header: 'Created Date',
            accessor: 'created',
            formatter: value => {
              const date = value as Date;
              return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            },
          },
        ];

        const result = toCSV(data, { columns, includeBOM: false });

        expect(result).toBe('Created Date\n2024-06-15');
      });
    });

    describe('inferred columns', () => {
      it('should infer columns from first row when not provided', () => {
        const data = [
          { a: 1, b: 2, c: 3 },
          { a: 4, b: 5, c: 6 },
        ];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe('a,b,c\n1,2,3\n4,5,6');
      });

      it('should use property keys as headers when inferring', () => {
        const data = [{ firstName: 'John', lastName: 'Doe' }];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toContain('firstName,lastName');
      });
    });

    describe('mixed data types', () => {
      it('should handle rows with mixed data types', () => {
        const data = [
          {
            id: 1,
            name: 'Test',
            active: true,
            count: 42.5,
            date: new Date('2024-01-01T00:00:00Z'),
            notes: null,
          },
        ];

        const result = toCSV(data, { includeBOM: false });

        expect(result).toBe(
          'id,name,active,count,date,notes\n1,Test,true,42.5,2024-01-01T00:00:00.000Z,'
        );
      });
    });

    describe('large data sets', () => {
      it('should handle many rows efficiently', () => {
        const data = Array.from({ length: 1000 }, (_, i) => ({
          id: i + 1,
          value: `item_${i + 1}`,
        }));

        const result = toCSV(data, { includeBOM: false });
        const lines = result.split('\n');

        expect(lines.length).toBe(1001); // header + 1000 data rows
        expect(lines[0]).toBe('id,value');
        expect(lines[1]).toBe('1,item_1');
        expect(lines[1000]).toBe('1000,item_1000');
      });
    });
  });

  describe('toCSVBlob', () => {
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

  describe('UTF8_BOM constant', () => {
    it('should be the correct BOM character', () => {
      expect(UTF8_BOM).toBe('\uFEFF');
      expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
    });
  });

  describe('edge cases', () => {
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
});
