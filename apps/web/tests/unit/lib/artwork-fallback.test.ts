import { describe, expect, it } from 'vitest';
import {
  getArtworkFallbackAccentStyle,
  getArtworkFallbackSurfaceStyle,
} from '@/lib/artwork-fallback';

describe('artwork fallback styles', () => {
  it('uses restrained sleeve planes instead of blob or orb artwork', () => {
    const style = getArtworkFallbackSurfaceStyle('All This Noise');
    const background = String(style.background);

    expect(background).toContain('linear-gradient');
    expect(background).toContain('repeating-linear-gradient');
    expect(background).toContain('--artwork-fallback-panel');
    expect(background).not.toContain('radial-gradient');
    expect(background).not.toContain('#');
  });

  it('keeps the accent as a subtle rule instead of a full-card gradient', () => {
    const style = getArtworkFallbackAccentStyle('All This Noise');
    const background = String(style.background);

    expect(background).toContain('transparent');
    expect(background).toContain('--artwork-fallback-accent');
    expect(background).not.toContain('radial-gradient');
  });
});
