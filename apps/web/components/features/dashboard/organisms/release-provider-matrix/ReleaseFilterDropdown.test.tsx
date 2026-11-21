import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { ReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import { ReleaseFilterDropdown } from './ReleaseFilterDropdown';
import type { ReleaseFilters } from './ReleaseTableSubheader';

const counts: ReleaseFilterCounts = {
  byType: {
    album: 5,
    ep: 2,
    single: 11,
    compilation: 1,
    live: 0,
    mixtape: 0,
    music_video: 0,
    other: 0,
  },
  byAvailability: { all: 19, complete: 12, incomplete: 7 },
  byPopularity: { low: 4, med: 8, high: 7 },
  byLabel: [{ label: 'Republic', count: 6 }],
};

const emptyFilters: ReleaseFilters = {
  releaseTypes: [],
  popularity: [],
  labels: [],
};

function renderDropdown(filters: ReleaseFilters, onChange = vi.fn()) {
  return render(
    <TooltipProvider>
      <ReleaseFilterDropdown
        filters={filters}
        onFiltersChange={onChange}
        counts={counts}
      />
    </TooltipProvider>
  );
}

describe('ReleaseFilterDropdown', () => {
  it('keeps the closed trigger axe-clean', async () => {
    const { container } = renderDropdown(emptyFilters);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('clears an active type pill and keeps the pills axe-clean', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderDropdown(
      { releaseTypes: ['album'], popularity: ['low'], labels: [] },
      onChange
    );

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Clear Release Type filter' })
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ releaseTypes: [] })
    );
  });
});
