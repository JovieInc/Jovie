import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerWarn } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: loggerWarn,
    error: vi.fn(),
  },
}));

import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

describe('LoadingSkeleton', () => {
  beforeEach(() => {
    loggerWarn.mockClear();
  });

  it('accepts valid fractional Tailwind size utilities', () => {
    const { container } = render(
      <LoadingSkeleton height='h-3.5' width='w-3.5' rounded='full' />
    );

    const skeleton = container.firstElementChild;

    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('h-3.5');
    expect(skeleton?.className).toContain('w-3.5');
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('warns and falls back for invalid size utilities', () => {
    const { container } = render(
      <LoadingSkeleton height='rounded-md' width='grid-cols-2' />
    );

    const skeleton = container.firstElementChild;

    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain('h-4');
    expect(skeleton?.className).toContain('w-full');
    expect(skeleton?.className).not.toContain('rounded-md');
    expect(skeleton?.className).not.toContain('grid-cols-2');
    expect(loggerWarn).toHaveBeenCalledTimes(2);
    expect(loggerWarn).toHaveBeenNthCalledWith(
      1,
      'Invalid height class "rounded-md". Using default value instead.',
      undefined,
      'LoadingSkeleton'
    );
    expect(loggerWarn).toHaveBeenNthCalledWith(
      2,
      'Invalid width class "grid-cols-2". Using default value instead.',
      undefined,
      'LoadingSkeleton'
    );
  });
});
