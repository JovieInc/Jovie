import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRetouchPrompt,
  getRetouchStyleVersion,
  WHITE_SPACE_STYLE_PROMPT,
} from './style';

describe('white-space retouch style', () => {
  it('embedded prompt matches the canonical markdown file byte-for-byte', () => {
    // styles/white-space.md is the canonical style doc (SKILL_REGISTRY
    // promptPath). The TS constant exists because serverless bundling cannot
    // trace runtime fs reads — this test is the anti-drift guard.
    const markdown = readFileSync(
      join(__dirname, 'styles', 'white-space.md'),
      'utf8'
    );
    expect(WHITE_SPACE_STYLE_PROMPT).toBe(markdown);
  });

  it('produces a stable sha256 style version', () => {
    const version = getRetouchStyleVersion();
    expect(version).toMatch(/^[a-f0-9]{64}$/);
    expect(getRetouchStyleVersion()).toBe(version);
  });

  it('builds the base prompt without artist direction', () => {
    const prompt = buildRetouchPrompt({});
    expect(prompt).toContain('Non-Negotiable Guardrails');
    expect(prompt).toContain('Intent → Action');
    expect(prompt).toContain('Preserve Clause For This Generation');
    expect(prompt).toContain(
      'Keep face identity unchanged unless the artist explicitly asked to change it'
    );
    expect(prompt).not.toContain('Artist Direction For This Image');
  });

  it('appends artist direction after the guardrails and keeps the preserve clause', () => {
    const prompt = buildRetouchPrompt({ instructions: 'slightly warmer tone' });
    expect(prompt).toContain('Artist Direction For This Image');
    expect(prompt).toContain('slightly warmer tone');
    expect(prompt).toContain('Preserve Clause For This Generation');
    expect(prompt.indexOf('Non-Negotiable Guardrails')).toBeLessThan(
      prompt.indexOf('Artist Direction For This Image')
    );
    expect(prompt.indexOf('Preserve Clause For This Generation')).toBeLessThan(
      prompt.indexOf('Artist Direction For This Image')
    );
  });

  it('maps common intents to retouch, enhance, extend, or replace_bg', () => {
    expect(WHITE_SPACE_STYLE_PROMPT).toContain('| retouch |');
    expect(WHITE_SPACE_STYLE_PROMPT).toContain('| enhance |');
    expect(WHITE_SPACE_STYLE_PROMPT).toContain('| extend |');
    expect(WHITE_SPACE_STYLE_PROMPT).toContain('| replace_bg |');
    expect(WHITE_SPACE_STYLE_PROMPT).toContain('natural skin texture');
  });
});
