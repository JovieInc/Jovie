import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';
import { expectFlatState } from '@/tests/utils/flat-state';

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('DialogLoadingSkeleton', () => {
  it('renders the dialog search and results regions flat', () => {
    const { container } = render(
      <DialogLoadingSkeleton open onClose={() => undefined} rows={4} />
    );

    expect(screen.getByTestId('dialog-loading-search')).toBeInTheDocument();
    const results = screen.getByTestId('dialog-loading-results');
    expect(results).toBeInTheDocument();
    expect(results.firstElementChild?.children).toHaveLength(4);
    expectFlatState(container);
    expect(
      screen.getAllByText('', { selector: '.skeleton' }).length
    ).toBeGreaterThan(0);
  });
});
