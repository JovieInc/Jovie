import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RING_LIGHT,
  loadRingLight,
  normalizeRingLight,
  ringLightKelvin,
  ringLightRgb,
  ringLightStyle,
  saveRingLight,
} from './ring-light';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('ring light', () => {
  it('blends from cool daylight to warm tungsten', () => {
    expect(ringLightRgb(0)).toBe('244 248 255');
    expect(ringLightRgb(1)).toBe('255 214 170');
    expect(ringLightKelvin(0)).toBe(6500);
    expect(ringLightKelvin(1)).toBe(3200);
  });

  it('clamps bad input to safe settings', () => {
    expect(
      normalizeRingLight({
        mode: 'laser' as never,
        brightness: 9,
        warmth: -2,
        width: 2,
      })
    ).toEqual({ mode: 'edges', brightness: 1, warmth: 0, width: 12 });
    expect(normalizeRingLight(null)).toEqual(DEFAULT_RING_LIGHT);
  });

  it('exposes CSS variables for the ring layer', () => {
    expect(ringLightStyle(DEFAULT_RING_LIGHT)).toMatchObject({
      '--studio-ring-level': '0.90',
      '--studio-ring-width': '28px',
    });
    expect(
      ringLightStyle({ ...DEFAULT_RING_LIGHT, mode: 'full' })[
        '--studio-ring-width'
      ]
    ).toBe('max(18vmin, 96px)');
  });

  it('remembers the creator settings', () => {
    const storage = memoryStorage();
    saveRingLight(
      { mode: 'full', brightness: 0.5, warmth: 0.2, width: 40 },
      storage
    );
    expect(loadRingLight(storage)).toEqual({
      mode: 'full',
      brightness: 0.5,
      warmth: 0.2,
      width: 40,
    });
  });

  it('falls back to defaults on unreadable storage', () => {
    const storage = memoryStorage();
    storage.setItem('jovie:teleprompter-studio:ring-light', '{oops');
    expect(loadRingLight(storage)).toEqual(DEFAULT_RING_LIGHT);
  });
});
