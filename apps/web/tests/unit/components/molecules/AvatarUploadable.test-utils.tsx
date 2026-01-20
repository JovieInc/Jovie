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
        // eslint-disable-next-line @next/next/no-img-element
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Test mock component
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
  // @ts-expect-error partial URL mock
  global.URL = {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  };
}
