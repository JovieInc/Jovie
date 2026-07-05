import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarkdownFrontmatter } from '@/lib/docs/parseMarkdownFrontmatter';
import { resolveAppContentPath } from '@/lib/filesystem-paths';

const SLUG = 'the-suno-playbook-teardown';
const BLOG_DIR = resolveAppContentPath('blog');

const raw = readFileSync(join(BLOG_DIR, `${SLUG}.md`), 'utf-8');
const { content, data } = parseMarkdownFrontmatter(raw);

describe('blog post: the-suno-playbook-teardown', () => {
  it('has required frontmatter fields', () => {
    expect(data.title).toBeTruthy();
    expect(data.date).toBe('2026-07-04');
    expect(data.author).toBe('Tim White');
    expect(data.authorUsername).toBe('tim');
    expect(data.category).toBeTruthy();
    expect(data.tags).toBeTruthy();
  });

  it('covers all 7 steps of the playbook', () => {
    // Each step must be represented as a heading
    expect(content).toMatch(/Step 1/);
    expect(content).toMatch(/Step 2/);
    expect(content).toMatch(/Step 3/);
    expect(content).toMatch(/Step 4/);
    expect(content).toMatch(/Step 5/);
    expect(content).toMatch(/Step 6/);
    expect(content).toMatch(/Step 7/);
  });

  it('mentions each mapped Jovie surface', () => {
    // Asset Graph (#10802), connectors (#10362), Release-to-Revenue Autopilot (#10359)
    expect(content).toMatch(/Asset Graph/i);
    expect(content).toMatch(/connector/i);
    expect(content).toMatch(/Release-to-Revenue/i);
  });

  it('lands the activation-over-catalog-volume thesis', () => {
    expect(content).toMatch(/activation/i);
    expect(content).toMatch(/catalog/i);
    // The key argument: distribution is commodity, activation is the moat
    expect(content).toMatch(/commodity/i);
    expect(content).toMatch(/moat/i);
  });

  it('includes a noob-move and why-it-breaks analysis per step', () => {
    expect(content).toMatch(/noob move/i);
    expect(content).toMatch(/why it breaks/i);
  });

  it('is substantive (at least 800 words)', () => {
    const wordCount = content
      .replaceAll(/^---[\s\S]*?---/g, '')
      .split(/\s+/)
      .filter(Boolean).length;
    expect(wordCount).toBeGreaterThan(800);
  });
});
