import { describe, expect, it } from 'vitest';
import { formatSessionDeviceName } from '@/features/dashboard/organisms/account-settings/utils';

describe('formatSessionDeviceName', () => {
  it('maps Electron session activity to Mac OS for customer-facing copy', () => {
    expect(formatSessionDeviceName('Electron')).toBe('Mac OS');
    expect(formatSessionDeviceName('JovieDesktop/26.5.56 Electron')).toBe(
      'Mac OS'
    );
  });

  it('keeps normal browser names and falls back for missing values', () => {
    expect(formatSessionDeviceName('Chrome')).toBe('Chrome');
    expect(formatSessionDeviceName(null)).toBe('Unknown device');
    expect(formatSessionDeviceName('   ')).toBe('Unknown device');
  });
});
