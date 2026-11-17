import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VisibilityAuditReportView } from './VisibilityAuditReportView';
import {
  EMPTY_VISIBILITY_AUDIT_REPORT,
  LONG_VISIBILITY_AUDIT_REPORT,
  SAMPLE_VISIBILITY_AUDIT_REPORT as report,
} from './visibility-audit-state-fixtures';

describe('VisibilityAuditReportView certificate', () => {
  it('keeps the stored sample axe-clean with every section heading', async () => {
    const { container } = render(<VisibilityAuditReportView report={report} />);

    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(8);
    await expectNoA11yViolations(container);
  });

  it('shows the empty report without inventing evidence', async () => {
    const { container } = render(
      <VisibilityAuditReportView report={EMPTY_VISIBILITY_AUDIT_REPORT} />
    );

    expect(screen.getByText('No conflicts recorded.')).toBeVisible();
    expect(screen.getByText('0 rows')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: `DSP Presence (0 Of ${report.dspPresence.registryCount})`,
      })
    ).toBeVisible();
    const fixes = screen.getByRole('heading', { name: 'Prioritized Fixes' })
      .parentElement as HTMLElement;
    expect(within(fixes).queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('renders long fixes in priority order and stays axe-clean in RTL', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <VisibilityAuditReportView report={LONG_VISIBILITY_AUDIT_REPORT} />
      </div>
    );

    const fixes = screen.getByRole('heading', { name: 'Prioritized Fixes' })
      .parentElement as HTMLElement;
    const items = within(fixes).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'Align the artist bio, handle and outbound links'
    );
    expect(items[0]).toHaveTextContent(
      'Manual: Update the bio on every profile'
    );
    expect(
      screen.getByText(/Tim White and the Midnight Orchestra of Los Angeles/)
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
