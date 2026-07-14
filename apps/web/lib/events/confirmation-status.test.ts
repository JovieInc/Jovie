import { describe, expect, it } from 'vitest';
import { deriveConfirmationStatus } from './confirmation-status';

describe('deriveConfirmationStatus', () => {
  it('confirms manual creator entries', () => {
    expect(deriveConfirmationStatus('manual')).toBe('confirmed');
  });

  it('keeps synced and future providers pending', () => {
    expect(deriveConfirmationStatus('bandsintown')).toBe('pending');
    expect(deriveConfirmationStatus('songkick')).toBe('pending');
    expect(deriveConfirmationStatus('admin_import')).toBe('pending');
    expect(deriveConfirmationStatus('future_provider')).toBe('pending');
  });
});
