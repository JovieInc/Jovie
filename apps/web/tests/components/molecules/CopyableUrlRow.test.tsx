import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';

const mockWriteText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: { writeText: mockWriteText },
  });
});

describe('CopyableUrlRow', () => {
  it('keeps the flat surface borderless', () => {
    render(
      <CopyableUrlRow
        url='https://jov.ie/tim/example'
        surface='flat'
        testId='flat-row'
      />
    );

    const row = screen.getByTestId('flat-row');

    expect(row.className).toContain('border-transparent');
    expect(row.className).not.toContain('border-(--linear-app-frame-seam)');
  });

  it('keeps the boxed surface bordered', () => {
    render(
      <CopyableUrlRow
        url='https://jov.ie/tim/example'
        surface='boxed'
        testId='boxed-row'
      />
    );

    expect(screen.getByTestId('boxed-row').className).toContain(
      'border-(--linear-app-frame-seam)'
    );
  });
});
