import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureRow } from '@/lib/ovie/certifications/fixtures';
import {
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { certificationTierLabel } from './CertificationGlyphs';
import {
  CertificationEvidenceStrip,
  CertificationIdentity,
} from './CertificationSummary';

function renderSummary(row: OvieCertificationRow) {
  return render(
    <div>
      <CertificationIdentity row={row} />
      <CertificationEvidenceStrip row={row} />
    </div>
  );
}

describe('CertificationSummary certificate', () => {
  it.each([false, true])(
    'keeps identity and evidence axe-clean with stale approval %s',
    async staleFounderLock => {
      const { container } = renderSummary({
        ...fixtureRow('signup'),
        staleFounderLock,
      });
      expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(
        OVIE_CERTIFICATION_TIERS.length
      );
      await expectNoA11yViolations(container);
    }
  );

  it('labels every tier missing when no evidence has landed', async () => {
    const row = fixtureRow('signup');
    const tiers = Object.fromEntries(
      OVIE_CERTIFICATION_TIERS.map(tier => [tier, 'missing'])
    ) as OvieCertificationRow['tiers'];
    const { container } = renderSummary({ ...row, tiers });
    const strip = within(screen.getByTestId('certification-evidence-strip'));
    for (const tier of OVIE_CERTIFICATION_TIERS) {
      expect(
        strip.getByRole('img', {
          name: certificationTierLabel(tier, 'missing'),
        })
      ).toBeInTheDocument();
    }
    await expectNoA11yViolations(container);
  });

  it('keeps a long title and an RTL document axe-clean', async () => {
    const row = fixtureRow('signup');
    const title =
      'Flow signup golden path through claim, onboarding chat, verification and the first paid plan';
    const { container } = render(
      <div dir='rtl'>
        <CertificationIdentity
          row={{ ...row, subject: { ...row.subject, title } }}
        />
      </div>
    );
    expect(screen.getByTitle(row.subject.id)).toHaveTextContent(title);
    await expectNoA11yViolations(container);
  });
});
