import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LinkAnalyticsPanel } from './LinkAnalyticsPanel';

describe('LinkAnalyticsPanel certificate', () => {
  it('renders the click analytics panel axe-clean', async () => {
    const { container } = render(<LinkAnalyticsPanel />);

    expect(screen.getByTestId('release-smart-link-analytics')).toBeVisible();
    expect(screen.getByText('Total Clicks')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LinkAnalyticsPanel />
      </div>
    );

    expect(screen.getByText('Last Click')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
