import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { expectFlatState } from '@/tests/utils/flat-state';
import { BillingLoadingSkeleton } from './BillingLoadingSkeleton';

describe('BillingLoadingSkeleton', () => {
  it('holds space for the header, plan card, three plan columns, actions and history', async () => {
    const { container } = render(<BillingLoadingSkeleton />);

    const root = container.firstElementChild as HTMLElement;
    // Header block, current plan card, plan grid, actions card, history card.
    expect(root.children).toHaveLength(5);
    const planGrid = root.children[2] as HTMLElement;
    expect(planGrid.children).toHaveLength(3);
    expect(container.textContent).toBe('');
    expectFlatState(container);
    await expectNoA11yViolations(container);
  });
});
