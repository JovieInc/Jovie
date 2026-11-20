import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { CAPABILITY_EVIDENCE_FIXTURE } from '@/lib/admin/capability-evidence-fixtures';
import type { CapabilityEvidenceRecord } from '@/lib/admin/capability-evidence-model';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CapabilityEvidenceMatrix } from './CapabilityEvidenceMatrix';

const base = CAPABILITY_EVIDENCE_FIXTURE;
const record = (
  overrides: Partial<CapabilityEvidenceRecord> = {}
): CapabilityEvidenceRecord => ({ ...base, ...overrides });

describe('CapabilityEvidenceMatrix certificate', () => {
  it('walks every evidence link from the keyboard', async () => {
    const user = userEvent.setup();
    const sha = 'b'.repeat(40);
    const { container } = render(
      <CapabilityEvidenceMatrix
        record={record({
          deployment: { ...base.deployment, commitSha: sha },
        })}
      />
    );

    await expectNoA11yViolations(container);
    const names = [
      'Feature registry →',
      'Release entities →',
      'Deployed commit →',
      'Registry source →',
    ];
    for (const name of names) {
      await user.tab();
      expect(screen.getByRole('link', { name })).toHaveFocus();
    }
    expect(
      screen.getByRole('link', { name: 'Feature registry →' })
    ).toHaveAttribute('href', APP_ROUTES.ADMIN_FEATURES);
    expect(
      screen.getByRole('link', { name: 'Release entities →' })
    ).toHaveAttribute('href', APP_ROUTES.ADMIN_RELEASES);
    expect(
      screen.getByRole('link', { name: 'Deployed commit →' })
    ).toHaveAttribute(
      'href',
      `https://github.com/JovieInc/Jovie/commit/${sha}`
    );
  });

  it('drops the commit link and keeps a registry link when nothing is deployed', async () => {
    const { container } = render(
      <CapabilityEvidenceMatrix
        record={record({
          certification: null,
          deployment: {
            commitSha: null,
            version: null,
            environment: null,
            deploymentId: null,
          },
        })}
      />
    );

    expect(
      screen.queryByRole('link', { name: 'Deployed commit →' })
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Registry source →' })
    ).toHaveAttribute(
      'href',
      'https://github.com/JovieInc/Jovie/blob/main/docs/FEATURE_REGISTRY.md'
    );
    await expectNoA11yViolations(container);
  });

  it('shows zero observations as a measured zero', async () => {
    const { container } = render(
      <CapabilityEvidenceMatrix
        record={record({
          exposure: { ...base.exposure, count: 0, latestAt: null },
        })}
      />
    );

    expect(
      screen.getByText(`0 in ${base.exposure.windowDays}d`)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows failed analytics reads as unknown, not zero', async () => {
    const failed = {
      measured: false,
      count: null,
      error: 'Read unavailable',
    };
    const { container } = render(
      <CapabilityEvidenceMatrix
        record={record({
          exposure: { ...base.exposure, ...failed },
          outcome: { ...base.outcome, ...failed },
        })}
      />
    );

    expect(
      container.querySelectorAll(
        '[data-measured="unknown"][title*="source error"]'
      )
    ).toHaveLength(2);
    expect(screen.queryByText(/0 in \d+d/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and RTL copy axe-clean', async () => {
    const title =
      'Public profile pages with release countdowns, merch drops, tour dates and every streaming destination';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CapabilityEvidenceMatrix record={record({ title })} />
      </div>
    );

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
