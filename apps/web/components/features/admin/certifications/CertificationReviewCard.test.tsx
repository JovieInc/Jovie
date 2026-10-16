import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  fixtureInventory,
  fixtureRow,
} from '@/lib/ovie/certifications/fixtures';
import { CertificationReviewCard } from './CertificationReviewCard';

const card = fixtureInventory().queue.needsYou[0]!.card!;
describe('CertificationReviewCard', () => {
  it('shows the decision brief and discloses evidence and effects', () => {
    const row = { ...fixtureRow('signup'), owner: 'Summer' };
    render(<CertificationReviewCard row={row} card={card} />);
    expect(screen.getByRole('heading', { name: /Flow signup/ })).toBeVisible();
    expect(screen.getByText('Owner: Summer')).toBeVisible();
    for (const value of [
      card.whyNow,
      card.journey,
      card.unblocks,
      card.decision,
    ]) {
      expect(screen.getByText(value)).toBeVisible();
    }
    const disclosure = screen.getByText('Evidence and decision effects');
    const details = disclosure.closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(disclosure);
    expect(details).toHaveAttribute('open');
    for (const value of Object.values(card.consequences)) {
      expect(screen.getByText(value)).toBeVisible();
    }
    expect(screen.getByText(card.greenEvidence.join(' · '))).toBeVisible();
  });

  it('keeps evidence and an encoded review link without a decision brief', () => {
    const row = { ...fixtureRow('signup'), id: 'flows:signup / next' };
    render(<CertificationReviewCard row={row} card={null} />);
    expect(screen.getByText('Owner: Unassigned')).toBeVisible();
    expect(screen.getByTestId('certification-evidence-strip')).toBeVisible();
    expect(screen.queryByText('Why now')).toBeNull();
    expect(screen.queryByText('Evidence and decision effects')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Review certification evidence' })
    ).toHaveAttribute(
      'href',
      `${APP_ROUTES.ADMIN_CERTIFICATIONS}?row=${encodeURIComponent(row.id)}`
    );
  });

  it.each([true, false])(
    'uses source or missing revision: %s',
    sourceAvailable => {
      const row = fixtureRow('signup');
      render(
        <CertificationReviewCard
          row={{ ...row, source: sourceAvailable ? row.source : null }}
          card={{ ...card, revision: null }}
        />
      );
      expect(
        screen.getByText(sourceAvailable ? row.source!.sha! : 'Missing')
      ).toBeVisible();
    }
  );
});
