import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceFilterDropdown } from './AudienceFilterDropdown';
import type { AudienceFilters } from './types';

function renderDropdown(filters: AudienceFilters, dir?: 'rtl') {
  const onFiltersChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceFilterDropdown
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </div>
    </TooltipProvider>
  );
  return { ...view, onFiltersChange };
}

async function openSegments(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Filter' }));
  await user.click(await screen.findByRole('menuitem', { name: /Segments/ }));
}

describe('AudienceFilterDropdown certificate', () => {
  it('adds a segment to the current filters', async () => {
    const user = userEvent.setup();
    const { container, onFiltersChange } = renderDropdown({ segments: [] });
    await expectNoA11yViolations(container);

    await openSegments(user);
    const item = await screen.findByRole('menuitemcheckbox', {
      name: /High Intent/,
    });
    item.focus();
    await user.keyboard('{Enter}');

    expect(onFiltersChange).toHaveBeenCalledWith({ segments: ['highIntent'] });
  });

  it('removes an already selected segment', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = renderDropdown({
      segments: ['highIntent', 'returning'],
    });

    expect(screen.getByRole('button', { name: 'Filter' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await openSegments(user);
    const item = await screen.findByRole('menuitemcheckbox', {
      name: /High Intent/,
    });
    item.focus();
    await user.keyboard('{Enter}');
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      segments: ['returning'],
    });
  });

  it('clears every segment from the open menu', async () => {
    const user = userEvent.setup();
    const { container, onFiltersChange } = renderDropdown({
      segments: ['alertsOn', 'touringCity'],
    });

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Clear All Filters/ })
    );

    expect(onFiltersChange).toHaveBeenCalledWith({ segments: [] });
    await expectNoA11yViolations(container);
  });

  it('renders the trigger inside an RTL document', async () => {
    const { container } = renderDropdown({ segments: ['frequent'] }, 'rtl');
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
