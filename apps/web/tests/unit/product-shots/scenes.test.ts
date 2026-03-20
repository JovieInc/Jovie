import { describe, expect, it } from 'vitest';
import { SCENES, type SceneDefinition } from '@/features/product-shots/scenes';

describe('SCENES registry', () => {
  it('has at least one scene', () => {
    expect(SCENES.length).toBeGreaterThan(0);
  });

  it('every scene has required fields', () => {
    for (const scene of SCENES) {
      expect(scene.id).toBeTruthy();
      expect(scene.label).toBeTruthy();
      expect(scene.description).toBeTruthy();
      expect(scene.defaultWidth).toBeGreaterThanOrEqual(100);
      expect(scene.defaultHeight).toBeGreaterThanOrEqual(100);
      expect(typeof scene.Component).toBe('function');
    }
  });

  it('scene IDs are unique', () => {
    const ids = SCENES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes expected scenes', () => {
    const ids = SCENES.map(s => s.id);
    expect(ids).toContain('releases-table');
    expect(ids).toContain('releases-content');
    expect(ids).toContain('artist-profile');
    expect(ids).toContain('pricing');
  });

  it('artist-profile defaults to mobile viewport', () => {
    const profile = SCENES.find(
      s => s.id === 'artist-profile'
    ) as SceneDefinition;
    expect(profile.defaultWidth).toBeLessThanOrEqual(500);
    expect(profile.defaultHeight).toBeGreaterThan(800);
  });

  it('desktop scenes default to at least 1200px wide', () => {
    const desktopScenes = SCENES.filter(s => s.id !== 'artist-profile');
    for (const scene of desktopScenes) {
      expect(scene.defaultWidth).toBeGreaterThanOrEqual(1200);
    }
  });
});
