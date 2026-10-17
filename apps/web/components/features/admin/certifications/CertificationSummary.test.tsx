import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureRow } from '@/lib/ovie/certifications/fixtures';
import { OVIE_CERTIFICATION_TIERS } from '@/lib/ovie/certifications/types';
import { certificationTierLabel } from './CertificationGlyphs';
import {
  CertificationEvidenceStrip,
  CertificationIdentity,
} from './CertificationSummary';

describe('CertificationSummary', () => {
  it.each([false, true])(
    'identifies the subject and flags stale approval: %s',
    staleFounderLock => {
      const row = { ...fixtureRow('signup'), staleFounderLock };
      render(<CertificationIdentity row={row} />);
      const title = screen.getByTitle(row.subject.id);
      expect(title).toHaveTextContent(row.subject.title);
      expect(Boolean(screen.queryByLabelText('Stale Founder Approval'))).toBe(
        staleFounderLock
      );
    }
  );

  it('labels every taste and operational tier with its own evidence status', () => {
    const row = fixtureRow('signup');
    const tiers = { ...row.tiers };
    const statuses = ['passed', 'failed', 'pending', 'missing'] as const;
    OVIE_CERTIFICATION_TIERS.forEach((tier, index) => {
      tiers[tier] = statuses[index % statuses.length]!;
    });
    render(<CertificationEvidenceStrip row={{ ...row, tiers }} />);
    const strip = within(screen.getByTestId('certification-evidence-strip'));
    for (const tier of OVIE_CERTIFICATION_TIERS) {
      expect(
        strip.getByRole('img', {
          name: certificationTierLabel(tier, tiers[tier]),
        })
      ).toBeVisible();
    }
  });
});
