/**
 * CSV conversion utility for exporting data to CSV format.
 * Handles proper escaping, Date formatting, and Excel compatibility.
 */

/**
 * Configuration for a single CSV column.
 */
export interface CSVColumn<T> {
  /** Header text to display in the CSV */
  header: string;
  /** Key of the property to access, or accessor function */
  accessor: keyof T | ((row: T) => unknown);
  /** Optional formatter to transform the value before output */
  formatter?: (value: unknown, row: T) => string;
}

/**
 * Options for CSV conversion.
 */
export interface CSVOptions<T> {
  /** Column configurations */
  columns?: CSVColumn<T>[];
  /** Whether to include BOM for Excel compatibility (default: true) */
  includeBOM?: boolean;
  /** Date format style: 'iso' for ISO string, 'locale' for locale string (default: 'iso') */
  dateFormat?: 'iso' | 'locale';
}

/**
 * Byte Order Mark for UTF-8, required for Excel to properly read UTF-8 CSVs.
 */
export const UTF8_BOM = '\uFEFF';

/**
 * Escape a value for CSV format.
 * Handles commas, quotes, and newlines according to RFC 4180.
 *
 * @param value - The value to escape
 * @returns The escaped string value
 */
export function escapeCSVValue(value: unknown): string {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string
  const stringValue = String(value);

  // Check if escaping is needed
  const needsQuoting =
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsQuoting) {
    // Escape double quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * Capitalize the first letter of a string.
 * Common formatter for CSV status and enum values.
 *
 * @param value - The value to capitalize (will be converted to string)
 * @returns String with first letter capitalized
 *
 * @example
 * capitalize('pending') // 'Pending'
 * capitalize('active') // 'Active'
 */
export function capitalize(value: unknown): string {
  const str = String(value);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format a boolean value as 'Yes' or 'No'.
 * Common formatter for CSV boolean fields.
 *
 * @param value - The boolean value to format
 * @returns 'Yes' if truthy, 'No' if falsy
 *
 * @example
 * formatYesNo(true) // 'Yes'
 * formatYesNo(false) // 'No'
 * formatYesNo(1) // 'Yes'
 * formatYesNo(0) // 'No'
 */
export function formatYesNo(value: unknown): string {
  return value ? 'Yes' : 'No';
}

/**
 * Format an optional value as a string, returning empty string if falsy.
 * Common formatter for CSV nullable/optional fields.
 *
 * @param value - The value to format (will be converted to string if truthy)
 * @returns String representation of value, or empty string if falsy
 *
 * @example
 * formatOptionalString('hello') // 'hello'
 * formatOptionalString(null) // ''
 * formatOptionalString(undefined) // ''
 * formatOptionalString('') // ''
 * formatOptionalString(123) // '123'
 */
export function formatOptionalString(value: unknown): string {
  return value ? String(value) : '';
}

/**
 * Format a Date value according to the specified format.
 *
 * @param date - The Date to format
 * @param format - The format style ('iso' or 'locale')
 * @returns The formatted date string
 */
export function formatDateValue(
  date: Date,
  format: 'iso' | 'locale' = 'iso'
): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }

  if (format === 'locale') {
    return date.toLocaleString();
  }

  return date.toISOString();
}

/**
 * Get the value from a row using a column configuration.
 *
 * @param row - The data row
 * @param column - The column configuration
 * @param dateFormat - The date format style
 * @returns The extracted and formatted value as a string
 */
function getColumnValue<T>(
  row: T,
  column: CSVColumn<T>,
  dateFormat: 'iso' | 'locale'
): string {
  // Extract raw value using accessor
  let value: unknown;
  if (typeof column.accessor === 'function') {
    value = column.accessor(row);
  } else {
    value = row[column.accessor];
  }

  // Apply custom formatter if provided
  if (column.formatter) {
    return column.formatter(value, row);
  }

  // Handle Date objects
  if (value instanceof Date) {
    return formatDateValue(value, dateFormat);
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string
  return String(value);
}

/**
 * Infer columns from the first data row.
 * Creates columns for all enumerable properties.
 *
 * @param data - The data array
 * @returns Array of column configurations
 */
function inferColumns<T extends object>(data: T[]): CSVColumn<T>[] {
  if (data.length === 0) {
    return [];
  }

  const firstRow = data[0];
  const keys = Object.keys(firstRow) as (keyof T)[];

  return keys.map(key => ({
    header: String(key),
    accessor: key,
  }));
}

/**
 * Convert an array of objects to a CSV string.
 *
 * @param data - Array of objects to convert
 * @param options - CSV conversion options
 * @returns CSV string with optional BOM
 *
 * @example
 * // Basic usage with auto-inferred columns
 * const csv = toCSV([{ name: 'John', age: 30 }]);
 *
 * @example
 * // With custom columns
 * const csv = toCSV(users, {
 *   columns: [
 *     { header: 'Full Name', accessor: 'name' },
 *     { header: 'Email Address', accessor: 'email' },
 *     { header: 'Status', accessor: 'isActive', formatter: (v) => v ? 'Active' : 'Inactive' },
 *   ]
 * });
 */
export function toCSV<T extends object>(
  data: T[],
  options: CSVOptions<T> = {}
): string {
  const { columns, includeBOM = true, dateFormat = 'iso' } = options;

  // Handle empty data
  if (data.length === 0) {
    // If columns provided, return just the header
    if (columns && columns.length > 0) {
      const headerRow = columns
        .map(col => escapeCSVValue(col.header))
        .join(',');
      return includeBOM ? UTF8_BOM + headerRow : headerRow;
    }
    return includeBOM ? UTF8_BOM : '';
  }

  // Use provided columns or infer from data
  const csvColumns = columns || inferColumns(data);

  // Build header row
  const headerRow = csvColumns.map(col => escapeCSVValue(col.header)).join(',');

  // Build data rows
  const dataRows = data.map(row =>
    csvColumns
      .map(column => escapeCSVValue(getColumnValue(row, column, dateFormat)))
      .join(',')
  );

  // Combine all rows
  const csvContent = [headerRow, ...dataRows].join('\n');

  // Add BOM if requested
  return includeBOM ? UTF8_BOM + csvContent : csvContent;
}

/**
 * Convert an array of objects to a CSV Blob.
 * Useful for creating downloadable files.
 *
 * @param data - Array of objects to convert
 * @param options - CSV conversion options
 * @returns Blob with text/csv MIME type
 */
export function toCSVBlob<T extends object>(
  data: T[],
  options: CSVOptions<T> = {}
): Blob {
  const csvString = toCSV(data, options);
  return new Blob([csvString], { type: 'text/csv;charset=utf-8' });
}
