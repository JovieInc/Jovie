import { describe, expect, test } from 'bun:test';
import {
  checkSkillSizes,
  DEFAULT_GENERATED_LIMIT_BYTES,
  DEFAULT_TEMPLATE_LIMIT_BYTES,
} from '../scripts/check-skill-size';

describe('skill prompt size ratchet', () => {
  test('templates and generated skills stay within current ratchet budgets', () => {
    const report = checkSkillSizes();
    expect(report.violations).toEqual([]);
    expect(report.entries.length).toBeGreaterThan(0);
  });

  test('ratchet budgets are intentionally explicit', () => {
    expect(DEFAULT_TEMPLATE_LIMIT_BYTES).toBe(60_000);
    expect(DEFAULT_GENERATED_LIMIT_BYTES).toBe(110_000);
  });
});
