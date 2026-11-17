import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceHeaderBadge } from './AudienceHeaderBadge';
import type { AudienceView } from './types';

function renderBadge(
  props: {
    view?: AudienceView;
    total: number | null;
    subscribers: number | null;
  },
  dir?: 'rtl'
) {
  const onViewChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceHeaderBadge
          view={props.view ?? 'all'}
          onViewChange={onViewChange}
          totalAudienceCount={props.total}
          subscriberCount={props.subscribers}
        />
      </div>
    </TooltipProvider>
  );
  return { ...view, onViewChange };
}

describe('AudienceHeaderBadge certificate', () => {
  it('derives the anonymous count and switches views on click', async () => {
    const user = userEvent.setup();
    const { container, onViewChange } = renderBadge({
      total: 482,
      subscribers: 120,
    });

    expect(screen.getByText('All (482)')).toBeInTheDocument();
    expect(screen.getByText('Identified (120)')).toBeInTheDocument();
    await user.click(screen.getByText('Anonymous (362)'));
    expect(onViewChange).toHaveBeenCalledWith('anonymous');
    await user.click(screen.getByText('Identified (120)'));
    expect(onViewChange).toHaveBeenLastCalledWith('identified');
    await expectNoA11yViolations(container);
  });

  it('drops counts that were skipped and never goes below zero', async () => {
    const pending = renderBadge({ total: null, subscribers: null });
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    await expectNoA11yViolations(pending.container);
    pending.unmount();

    renderBadge({ total: 5, subscribers: 9 });
    expect(screen.getByText('Anonymous (0)')).toBeInTheDocument();
  });

  it('shows zero counts for an empty audience and works in RTL', async () => {
    const empty = renderBadge({ total: 0, subscribers: 0 });
    expect(screen.getByText('All (0)')).toBeInTheDocument();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const rtl = renderBadge(
      { view: 'identified', total: 12_345_678, subscribers: 2_345_678 },
      'rtl'
    );
    expect(screen.getByText('Anonymous (10000000)')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
