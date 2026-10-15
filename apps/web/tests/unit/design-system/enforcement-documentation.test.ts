import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const BASELINES = join(WEB_ROOT, 'tests/unit/design-system');
const design = readFileSync(join(REPO_ROOT, 'DESIGN.md'), 'utf8');
const enforcement =
  design.split('### Enforcement\n')[1]?.split('\n---')[0] ?? '';

function row(gate: string): string[] {
  const matches = enforcement
    .split('\n')
    .filter(line => line.startsWith(`| \`${gate}\` |`));
  expect(matches, `one enforcement row for ${gate}`).toHaveLength(1);
  return matches[0]
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
}

function baseline(name: string) {
  return JSON.parse(
    readFileSync(join(BASELINES, `${name}.baseline.json`), 'utf8')
  );
}

function counts(values: Record<string, number>): string {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

describe('DESIGN.md enforcement source parity (JOV-8039)', () => {
  it('matches effective ESLint severities, including disabled rules', async () => {
    const eslint = new ESLint({
      cwd: WEB_ROOT,
      overrideConfigFile: join(WEB_ROOT, 'eslint.config.js'),
    });
    // A new production file exercises the default, outside grandfathered paths.
    const config = await eslint.calculateConfigForFile(
      join(WEB_ROOT, 'components/DesignEnforcementProbe.tsx')
    );
    for (const rule of [
      '@jovie/no-hardcoded-theme-colors',
      '@jovie/ui-feel',
      'shadcn/no-restyle',
    ]) {
      const severity = config.rules[rule][0] as number;
      expect(row(rule)[1], rule).toBe(
        `\`${['off', 'warn', 'error'][severity]}\``
      );
      expect(row(rule)[3], rule).toBe(severity === 0 ? 'No' : 'Yes');
    }
  });

  it.each([
    'arbitrary-values',
    'deprecated-button-alias',
    'linear-namespace',
    'source-identity',
  ])('matches the %s committed count', name => {
    expect(row(name)[4]).toBe(`${baseline(name).count}`);
  });

  it('matches the radius inventory and active blocking status', () => {
    const radius = baseline('arbitrary-radius');
    expect(row('arbitrary-radius')[4]).toBe(
      `${radius.count} occurrences; ${radius.files} files`
    );
    expect(row('arbitrary-radius').slice(1, 4)).toEqual([
      '`error`',
      'S + G',
      'Yes',
    ]);
    expect(radius.$comment).toMatch(/active/i);
    expect(radius.$comment).not.toMatch(/activation follows/i);
  });

  it('matches the component-family counts and blocking mode', () => {
    const family = baseline('component-family');
    expect(row('component-family')[4]).toBe(counts(family.counts));
    const guard = readFileSync(
      join(BASELINES, 'component-family-ratchet.test.ts'),
      'utf8'
    );
    expect(guard).toContain('const WARN_ONLY = false;');
    expect(row('component-family').slice(1, 4)).toEqual([
      '`error`',
      'G',
      'Yes',
    ]);
    expect(family.note).not.toContain('Flip WARN_ONLY=false');
  });

  it('matches both spacing tiers without claiming strict blocks', () => {
    const spacing = baseline('spacing-scale');
    for (const tier of ['conservative', 'strict']) {
      const { armed, count, perFamily } = spacing[tier];
      const cells = row(`spacing-scale (${tier})`);
      expect(cells[1]).toBe(armed ? '`error`' : '`warn`');
      expect(cells[3]).toBe(armed ? 'Yes' : 'No');
      expect(cells[4]).toBe(`${count}; armed=${armed}; ${counts(perFamily)}`);
    }
  });

  it('matches all contrast buckets rather than assuming remaining debt', () => {
    const raw = JSON.parse(
      readFileSync(join(WEB_ROOT, 'contrast-ratchet.baseline.json'), 'utf8')
    );
    delete raw._comment;
    expect(row('contrast (raw colors)')[4]).toBe(counts(raw));
  });

  it('matches the UI-feel, touch-target and no-restyle ratchet baselines', () => {
    const feel = JSON.parse(
      readFileSync(join(WEB_ROOT, 'ui-feel-ratchet.baseline.json'), 'utf8')
    );
    delete feel._comment;
    expect(row('ui-feel ratchet')[4]).toBe(counts(feel));
    const touch = JSON.parse(
      readFileSync(join(WEB_ROOT, 'touch-target-ratchet.baseline.json'), 'utf8')
    );
    expect(row('touch-target')[4]).toBe(`${touch.count}`);
    const restyle = baseline('shadcn-no-restyle');
    expect(row('shadcn/no-restyle')[4]).toBe(
      `${restyle.maxFiles} files; ${restyle.maxMessages} messages (grandfathered)`
    );
  });
});
