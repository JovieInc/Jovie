import { describe, expect, it } from 'vitest';
import { macCompatibility } from './mac-compatibility';

const mac = (version: string) => ({
  userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X ${version}) Safari/605.1.15`,
  platform: 'MacIntel',
  maxTouchPoints: 0,
});
describe('supported Mac application boundary', () => {
  it.each(['13_0', '14_6', '26_0'])(
    'accepts supported universal Macs %s',
    version => {
      expect(macCompatibility(mac(version))).toBe('compatible');
    }
  );
  it.each(['10_14_6', '11_7_10', '12_7'])(
    'retains fallback below runtime floor %s',
    version => {
      expect(macCompatibility(mac(version))).toBe('incompatible');
    }
  );
  it('uses actual client hints without calling a frozen UA compatible or incompatible', () => {
    expect(macCompatibility(mac('10_15_7'))).toBe('unknown');
    expect(macCompatibility(mac('10_15_7'), '13.6.0')).toBe('compatible');
    expect(macCompatibility(mac('10_15_7'), '12.7.0')).toBe('incompatible');
    expect(macCompatibility(mac('10_15_7'), 'bad')).toBe('unknown');
  });
  it('preserves iPad Safari and non-Mac platforms', () => {
    expect(macCompatibility({ ...mac('10_15_7'), maxTouchPoints: 5 })).toBe(
      'other'
    );
    expect(
      macCompatibility({
        userAgent: 'Windows NT 10.0',
        platform: 'Win32',
        maxTouchPoints: 0,
      })
    ).toBe('other');
    expect(
      macCompatibility({
        ...mac('13_0'),
        userAgent: 'Macintosh PPC Mac OS X 10_5_8',
      })
    ).toBe('incompatible');
  });
});
