/**
 * PUBLIC_SKILL_REGISTRY / SKILL_REGISTRY type-shape and invariant tests.
 *
 * No DB connection required — purely validates the code-side registry
 * against the SkillDefinition contract and business invariants.
 */

import { describe, expect, it } from 'vitest';
import { TOOL_UI_REGISTRY } from '@/lib/chat/tool-ui-registry';
import {
  PUBLIC_SKILL_CHAT_TOOL_IDS,
  PUBLIC_SKILL_REGISTRY,
  SKILL_REGISTRY,
} from './registry';

describe('PUBLIC_SKILL_REGISTRY', () => {
  const skills = Object.entries(PUBLIC_SKILL_REGISTRY);

  it('exports SKILL_REGISTRY as a back-compat alias of PUBLIC_SKILL_REGISTRY', () => {
    expect(SKILL_REGISTRY).toBe(PUBLIC_SKILL_REGISTRY);
  });

  it('has at least one skill entry', () => {
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });

  it('contains the retouch skill', () => {
    expect(PUBLIC_SKILL_REGISTRY).toHaveProperty('retouch');
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

  it.each(
    skills
  )('%s is backfilled as ga/1.0.0-class lifecycle', (_key, skill) => {
    expect(skill.lifecycle).toBe('ga');
    expect(skill.activeVersion).toBe(skill.version);
    expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe('retouch skill', () => {
    const retouch = PUBLIC_SKILL_REGISTRY.retouch;

    it('uses the expected model', () => {
      expect(retouch.model).toBe('google/gemini-2.5-flash-image');
    });

    it('gates on the AI retouching boolean entitlement', () => {
      expect(retouch.entitlement).toBe('canAccessAiRetouching');
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

  /**
   * JOV-3013 — partial catalog intent.
   *
   * PUBLIC_SKILL_REGISTRY is the admin/playbook/postbuild product-skill
   * catalog. Live chat tools are a larger, plan-gated surface. These tests
   * fail if cataloged chat-facing skills drift from TOOL_UI_REGISTRY, and
   * document that the live tool set is intentionally larger.
   */
  describe('partial catalog vs live chat tools (JOV-3013)', () => {
    it('is intentionally smaller than the live chat UI tool registry', () => {
      const catalogSize = Object.keys(PUBLIC_SKILL_REGISTRY).length;
      const liveUiSize = Object.keys(TOOL_UI_REGISTRY).length;
      expect(liveUiSize).toBeGreaterThan(catalogSize);
    });

    it('maps every cataloged chat-facing skill to a live TOOL_UI_REGISTRY id', () => {
      for (const [skillId, chatToolId] of Object.entries(
        PUBLIC_SKILL_CHAT_TOOL_IDS
      )) {
        expect(
          TOOL_UI_REGISTRY[chatToolId as keyof typeof TOOL_UI_REGISTRY],
          `catalog skill "${skillId}" maps to missing chat tool "${chatToolId}"`
        ).toBeDefined();
      }
    });

    it('keeps PUBLIC_SKILL_CHAT_TOOL_IDS keys inside PUBLIC_SKILL_REGISTRY', () => {
      for (const skillId of Object.keys(PUBLIC_SKILL_CHAT_TOOL_IDS)) {
        expect(PUBLIC_SKILL_REGISTRY).toHaveProperty(skillId);
      }
    });

    it('documents partial-catalog intent in the registry module source', async () => {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const path = await import('node:path');
      const registryPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'registry.ts'
      );
      const source = await readFile(registryPath, 'utf8');
      expect(source).toMatch(/partial catalog/i);
      expect(source).toContain('PUBLIC_SKILL_REGISTRY');
      expect(source).toMatch(/NOT.*exhaustive list of tools/i);
    });
  });
});
