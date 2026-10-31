import { describe, expect, it } from 'vitest';
import { plainOutcome } from './plain-language';

describe('plainOutcome', () => {
  it('strips the conventional prefix and scope, keeps the outcome', () => {
    expect(
      plainOutcome('fix(lanes): keep the status feed under the cap')
    ).toEqual({
      text: 'Keep the status feed under the cap',
      reference: null,
    });
    expect(plainOutcome('feat(ovie)!: make Home a company HUD').text).toBe(
      'Make Home a company HUD'
    );
    expect(plainOutcome('chore: bump deps').text).toBe('Bump deps');
  });
  it('moves a trailing PR number out of the primary text', () => {
    expect(
      plainOutcome('fix(onboarding): retain typed email (#23094)')
    ).toEqual({
      text: 'Retain typed email',
      reference: '#23094',
    });
    expect(plainOutcome('Show every agent lane · #23101')).toEqual({
      text: 'Show every agent lane',
      reference: '#23101',
    });
    expect(plainOutcome('Retain typed email #23094').reference).toBe('#23094');
  });
  it('drops a leading issue id and leaves plain titles alone', () => {
    expect(plainOutcome('JOV-9019: Ovie false green').text).toBe(
      'Ovie false green'
    );
    expect(plainOutcome('Vercel on-demand concurrency for Jovie')).toEqual({
      text: 'Vercel on-demand concurrency for Jovie',
      reference: null,
    });
  });
  it('never returns an empty outcome', () => {
    expect(plainOutcome('fix:').text).toBe('Fix:');
    expect(plainOutcome('  ').text).toBe('');
    expect(plainOutcome('#123').text).toBe('#123');
  });
  it('does not strip words that merely look like a prefix', () => {
    expect(plainOutcome('Fixing the footer').text).toBe('Fixing the footer');
    expect(plainOutcome('feature flags for Ovie').text).toBe(
      'Feature flags for Ovie'
    );
  });
});
