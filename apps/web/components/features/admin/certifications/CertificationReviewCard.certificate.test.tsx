import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  fixtureInventory,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CertificationReviewCard } from './CertificationReviewCard';

const card = fixtureInventory().queue.needsYou[0]!.card!;

describe('CertificationReviewCard certificate', () => {
  it('opens the evidence disclosure, axe-clean open and closed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CertificationReviewCard row={fixtureRow('signup')} card={card} />
    );
    await expectNoA11yViolations(container);
    const summary = screen.getByText('Evidence and decision effects');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    await user.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText(card.consequences.accept)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps the card without a brief axe-clean', async () => {
    const { container } = render(
      <CertificationReviewCard
        row={{ ...fixtureRow('signup'), owner: null }}
        card={null}
      />
    );
    expect(screen.getByText('Owner: Unassigned')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review certification evidence' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long brief copy in an RTL document axe-clean', async () => {
    const long =
      'This deliberately long line explains why the decision matters now and what it unblocks.';
    const { container } = render(
      <div dir='rtl'>
        <CertificationReviewCard
          row={fixtureRow('signup')}
          card={{ ...card, whyNow: long, decision: long }}
        />
      </div>
    );
    expect(screen.getAllByText(long)).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
