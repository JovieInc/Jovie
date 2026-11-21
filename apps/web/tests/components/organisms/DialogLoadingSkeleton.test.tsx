import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('DialogLoadingSkeleton', () => {
  it('renders the dialog search and results cards', () => {
    render(<DialogLoadingSkeleton open onClose={() => undefined} rows={4} />);

    expect(
      screen.getByTestId('dialog-loading-search-card')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('dialog-loading-results-card')
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('', { selector: '.skeleton' }).length
    ).toBeGreaterThan(0);
  });
});
