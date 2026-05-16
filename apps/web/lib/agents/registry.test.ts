/**
 * SKILL_REGISTRY type-shape and invariant tests.
 *
 * No DB connection required — purely validates the code-side registry
 * against the SkillDefinition contract and business invariants.
 */

import { describe, expect, it } from 'vitest';
import type { SkillId } from './registry';
import { SKILL_REGISTRY } from './registry';
import type { SkillDefinition } from './types';

describe('SKILL_REGISTRY', () => {
  const skills = Object.entries(SKILL_REGISTRY) as [SkillId, SkillDefinition][];

  it('has at least one skill entry', () => {
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });

  it('contains the retouch skill', () => {
    expect(SKILL_REGISTRY).toHaveProperty('retouch');
  });

  it.each(skills)('%s has required string fields', (_key, skill) => {
    expect(typeof skill.id).toBe('string');
    expect(skill.id.length).toBeGreaterThan(0);
    expect(typeof skill.name).toBe('string');
    expect(skill.name.length).toBeGreaterThan(0);
    expect(typeof skill.version).toBe('string');
    expect(skill.version.length).toBeGreaterThan(0);
    expect(typeof skill.entitlement).toBe('string');
    expect(skill.entitlement.length).toBeGreaterThan(0);
    expect(typeof skill.model).toBe('string');
    expect(skill.model.length).toBeGreaterThan(0);
  });

  it.each(skills)('%s has a valid kind', (_key, skill) => {
    expect(['vertical_agent', 'tool', 'style']).toContain(skill.kind);
  });

  it.each(skills)('%s key matches id field', (key, skill) => {
    expect(skill.id).toBe(key);
  });

  it.each(skills)('%s has a metadata object', (_key, skill) => {
    expect(typeof skill.metadata).toBe('object');
    expect(skill.metadata).not.toBeNull();
  });

  describe('retouch skill', () => {
    const retouch = SKILL_REGISTRY.retouch;

    it('uses the expected model', () => {
      expect(retouch.model).toBe('google/gemini-2.5-flash-image');
    });

    it('gates on ai_retouching entitlement', () => {
      expect(retouch.entitlement).toBe('ai_retouching');
    });

    it('has a promptPath for the white-space style', () => {
      expect(retouch.promptPath).toContain('white-space');
    });

    it('has the correct metadata surface/action', () => {
      expect(retouch.metadata.surface).toBe('image');
      expect(retouch.metadata.action).toBe('retouch_image');
      expect(retouch.metadata.style).toBe('white-space');
    });

    it('is version 1.0.0', () => {
      expect(retouch.version).toBe('1.0.0');
    });
  });
});
