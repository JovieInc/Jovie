/**
 * Shared test utilities for AvatarUploadable tests
 */

import { vi } from 'vitest';

// Mock analytics tracking
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: vi
    .fn()
    .mockImplementation(({ src, alt, onLoad, onError, ...props }: any) => {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- Mock for next/image
        <img
          src={src}
          alt={alt}
          onLoad={onLoad}
          onError={onError}
          {...props}
          data-testid='avatar-image'
        />
      );
    }),
}));

/**
 * Create a mock File for testing
 */
export const createMockFile = (
  name = 'test.jpg',
  type = 'image/jpeg',
  size = 1024
): File => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/**
 * Create mock callback functions for testing
 */
export function createMockCallbacks() {
  return {
    mockOnUpload: vi.fn(),
    mockOnSuccess: vi.fn(),
    mockOnError: vi.fn(),
  };
}

/**
 * Setup URL mocks for blob preview
 */
export function setupUrlMocks() {
  // Don't replace `global.URL` (Next.js uses it as a constructor). Only stub
  // the static methods used by blob preview logic, and return a cleanup fn.
  const originalCreateObjectURL = global.URL?.createObjectURL;
  const originalRevokeObjectURL = global.URL?.revokeObjectURL;

  Object.defineProperty(global.URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:preview'),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global.URL, 'revokeObjectURL', {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });

  return () => {
    if (originalCreateObjectURL) {
      Object.defineProperty(global.URL, 'createObjectURL', {
        value: originalCreateObjectURL,
        configurable: true,
        writable: true,
      });
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(global.URL, 'revokeObjectURL', {
        value: originalRevokeObjectURL,
        configurable: true,
        writable: true,
      });
    }
  };
}
