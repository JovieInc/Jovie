import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OVIE_CERTIFICATION_STATE_LABELS,
  OVIE_CERTIFICATION_STATES,
  OVIE_CERTIFICATION_TIER_LABELS,
  type OvieCertificationTierStatus,
} from '@/lib/ovie/certifications/types';
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

describe('CertificationGlyphs', () => {
  it.each(OVIE_CERTIFICATION_STATES)(
    'gives the %s state a visible shape and accessible label',
    state => {
      render(<CertificationStateGlyph state={state} />);
      const glyph = screen.getByRole('img', {
        name: OVIE_CERTIFICATION_STATE_LABELS[state],
      });
      expect(glyph).toHaveAttribute('data-state', state);
      expect(glyph.querySelector('circle')).not.toBeNull();
    }
  );

  it.each(TIER_STATUSES)(
    'labels and distinguishes %s evidence without relying on color',
    status => {
      render(<CertificationTierGlyph tier='tests_coverage' status={status} />);
      const label = certificationTierLabel('tests_coverage', status);
      const glyph = screen.getByRole('img', { name: label });
      expect(glyph).toHaveAttribute('data-tier', 'tests_coverage');
      expect(glyph).toHaveAttribute('data-status', status);
      expect(glyph.querySelector('circle')).not.toBeNull();
      expect(label).toMatch(
        new RegExp(`^${OVIE_CERTIFICATION_TIER_LABELS.tests_coverage}:`)
      );
    }
  );
});
