import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RELEASE_FILTERS,
  ReleaseTableSubheader,
} from './ReleaseTableSubheader';

vi.mock('@/contexts/TableMetaContext', () => ({
  useTableMeta: () => ({ tableMeta: { rightPanelWidth: 0 } }),
}));

function renderSubheader(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('ReleaseTableSubheader', () => {
  it('renders the release view segment control when a view handler is set', () => {
    renderSubheader(
      <ReleaseTableSubheader
        releases={[]}
        allReleases={[]}
        selectedIds={new Set()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={vi.fn()}
        releaseView='releases'
        onReleaseViewChange={vi.fn()}
      />
    );

    expect(screen.getByText('Tracks')).toBeInTheDocument();
    expect(screen.getByText('Releases')).toBeInTheDocument();
  });

  it('renders the preview toggle in the toolbar', () => {
    renderSubheader(
      <ReleaseTableSubheader
        releases={[]}
        allReleases={[]}
        selectedIds={new Set()}
        filters={DEFAULT_RELEASE_FILTERS}
        onFiltersChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Toggle release preview' })
    ).toBeInTheDocument();
  });
});
