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
        url='https://jov.ie/timwhite/example'
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
        url='https://jov.ie/timwhite/example'
        surface='boxed'
        testId='boxed-row'
      />
    );

    expect(screen.getByTestId('boxed-row').className).toContain(
      'border-(--linear-app-frame-seam)'
    );
  });

  it('hides actions by default when actionsVisibility is hover', () => {
    render(
      <CopyableUrlRow
        url='https://jov.ie/timwhite/example'
        actionsVisibility='hover'
        testId='hover-row'
      />
    );

    const copyBtn = screen.getByTitle('Copy link');
    const actions = copyBtn.parentElement as HTMLElement;
    expect(actions.className).toContain('opacity-0');
    expect(actions.className).toContain('group-hover:opacity-100');
    expect(actions.className).toContain('focus-within:opacity-100');
  });

  it('omits leading link icon on the flat surface', () => {
    const { container } = render(
      <CopyableUrlRow
        url='https://jov.ie/timwhite/example'
        surface='flat'
        testId='flat-no-icon'
      />
    );

    const row = container.querySelector('[data-testid="flat-no-icon"]');
    expect(row?.querySelector('svg.lucide-link-2')).toBeNull();
  });
});
