import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OVIE_CERTIFICATION_STATE_LABELS,
  OVIE_CERTIFICATION_STATES,
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationTierStatus,
} from '@/lib/ovie/certifications/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CertificationStateGlyph,
  CertificationTierGlyph,
  certificationTierLabel,
} from './CertificationGlyphs';

const TIER_STATUSES: readonly OvieCertificationTierStatus[] = [
  'passed',
  'failed',
  'pending',
  'missing',
];

describe('CertificationGlyphs certificate', () => {
  it.each(OVIE_CERTIFICATION_STATES)(
    'keeps the %s state glyph axe-clean with its title',
    async state => {
      const { container } = render(<CertificationStateGlyph state={state} />);
      const glyph = screen.getByRole('img', {
        name: OVIE_CERTIFICATION_STATE_LABELS[state],
      });
      expect(glyph.querySelector('title')).toHaveTextContent(
        OVIE_CERTIFICATION_STATE_LABELS[state]
      );
      await expectNoA11yViolations(container);
    }
  );

  it.each(TIER_STATUSES)(
    'keeps every tier glyph axe-clean when %s',
    async status => {
      const { container } = render(
        <div>
          {OVIE_CERTIFICATION_TIERS.map(tier => (
            <CertificationTierGlyph key={tier} tier={tier} status={status} />
          ))}
        </div>
      );
      for (const tier of OVIE_CERTIFICATION_TIERS) {
        expect(
          screen.getByRole('img', {
            name: certificationTierLabel(tier, status),
          })
        ).toHaveAttribute('data-status', status);
      }
      await expectNoA11yViolations(container);
    }
  );

  it('stays axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <CertificationStateGlyph state='founder_locked' />
        <CertificationTierGlyph tier='ci' status='pending' />
      </div>
    );
    expect(screen.getAllByRole('img')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
