/**
 * Unit tests for the canonical-ui-label-casing ESLint rule.
 */

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import {
  assertShrinkOnly,
  checkBaseline,
} from '../scripts/lint-ui-label-casing-baseline.mjs';

const require = createRequire(import.meta.url);
const rule = require('./canonical-ui-label-casing.js');

RuleTester.describe = describe as typeof RuleTester.describe;
RuleTester.it = it as typeof RuleTester.it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const filename = '/project/apps/web/components/example/Example.tsx';

ruleTester.run('canonical-ui-label-casing', rule, {
  valid: [
    ...[
      "Connect Spotify's account",
      'Connect Spotify’s account',
      'Confirm I own these rights',
      "Confirm I'm the owner",
      'Confirm I’ve read this',
      'Connect Apple Music',
      'Copy EP',
      'Copy UPC/EAN',
      'Connect Ovie',
      'Open macOS settings',
      'iOS settings',
      'Copy ISRC',
      'Connect Spotify',
      'Connect YouTube',
      'Use AI',
      'Copy URL',
      'Enter ID',
      'Open Stripe',
      'Register with BMI',
      'Register with ASCAP',
    ].map(text => ({ filename, code: `<Button>${text}</Button>` })),

    {
      filename,
      code: `<Button>Copy profile link</Button>`,
    },
    {
      filename,
      code: `<CardTitle>Grow your audience</CardTitle>`,
    },
    {
      filename,
      code: `<CardDescription>Share your profile link on social media.</CardDescription>`,
    },
    {
      // Multi-sentence sentence-case copy: words after a sentence boundary may
      // legitimately be capitalized (regression for the layout.tsx metadata
      // false-positive). "AI" is an approved abbreviation.
      filename,
      code: `<CardDescription>Share your profile link. Fans can subscribe and AI keeps it current.</CardDescription>`,
    },
    {
      filename,
      code: `<span aria-label="Copy profile link" />`,
    },
    {
      // Hyphenated compounds: sentence case keeps post-hyphen segments
      // lowercase ("Follow-up"). Regression — this exact form used to be
      // unsatisfiable (the word regex rejected every hyphenated word while
      // toCanonicalTitleCase produced this same string as the expected fix).
      filename,
      code: `const items = [{ label: 'Follow-up delay (hours)' }];`,
    },
    {
      filename,
      code: `const items = [{ label: 'Last action' }];`,
    },
    {
      filename,
      code: `const issues = [{ label: '0 tracks' }];`,
    },
    {
      filename,
      code: `const options = [{ label: 'Low (0-33)' }];`,
    },
    {
      filename,
      code: `toast.success('Member removed');`,
    },
    {
      filename,
      code: `<Button>LTV</Button>`,
    },
    {
      filename,
      code: `<Button>Install iOS alpha</Button>`,
    },
    {
      filename,
      code: `
        function Example() {
          return (
            <>
              {/* ui-casing-allow: legacy label */}
              <Button>go back</Button>
            </>
          );
        }
      `,
    },
    {
      filename: '/project/apps/web/lib/utils/example.ts',
      code: `const label = 'open profile';`,
    },
    {
      filename: '/project/apps/web/components/example/Example.stories.tsx',
      code: `<Button>open profile</Button>`,
    },
  ],

  invalid: [
    ...[
      'Connect Music',
      'SAVE',
      'Open MiXeD settings',
      'Connect Apple Music Settings',
      'Copy EP Code',
      '"open settings"',
    ].map(text => ({
      filename,
      code: `<Button>${text}</Button>`,
      errors: [{ messageId: 'useSentenceCase' }],
    })),

    {
      filename,
      code: `<Button>copy profile link</Button>`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `<Button>Copy Profile Link</Button>`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `<Badge>LAST ACTION</Badge>`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `<CardDescription>Share Your Profile Link On Social Media.</CardDescription>`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `<input aria-label="go back" />`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `const columns = [{ header: 'last action' }];`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `const issues = [{ label: '0 Tracks' }];`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `toast.error('Member Removed');`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `<TooltipContent>High Intent</TooltipContent>`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
  ],
});

describe('sentence case migration baseline', () => {
  it('keeps one sorted file per line for parallel copy PRs', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'canonical-ui-label-casing.baseline.json'),
      'utf8'
    );
    const baseline = JSON.parse(source);
    const files = Object.keys(baseline);
    expect(files).toEqual([...files].sort());
    expect(source.trim().split('\n')).toHaveLength(files.length + 2);
  });
  it('compares committed base debt and rejects growth, while allowing the introducing PR', () => {
    const cacheDir = path.resolve(import.meta.dirname, '../.cache');
    mkdirSync(cacheDir, { recursive: true });
    const root = mkdtempSync(path.join(cacheDir, 'casing-baseline-'));
    const file = path.join(
      root,
      'apps/web/eslint-rules/canonical-ui-label-casing.baseline.json'
    );
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    const commit = () => {
      git('add', '.');
      git(
        '-c',
        'user.name=Casing test',
        '-c',
        'user.email=casing@example.test',
        'commit',
        '-qm',
        'fixture'
      );
    };
    try {
      git('init', '-q');
      writeFileSync(path.join(root, 'fixture'), 'casing');
      commit();
      expect(() => checkBaseline('HEAD', root)).not.toThrow();
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(
        file,
        JSON.stringify({ 'a.tsx': { 'label: Old Label': 2 } })
      );
      commit();
      writeFileSync(
        file,
        JSON.stringify({ 'a.tsx': { 'label: Old Label': 1 } })
      );
      expect(() => checkBaseline('HEAD', root)).not.toThrow();
      writeFileSync(
        file,
        JSON.stringify({ 'a.tsx': { 'label: New Label': 1 } })
      );
      expect(() => checkBaseline('HEAD', root)).toThrow('may only shrink');
      expect(() => checkBaseline('missing-ref', root)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('only permits removing strings or reducing counts', () => {
    const previous = { 'a.tsx': { '<Button>: Old Label': 2 } };
    expect(() => assertShrinkOnly({}, previous)).not.toThrow();
    expect(() =>
      assertShrinkOnly({ 'a.tsx': { '<Button>: Old Label': 1 } }, previous)
    ).not.toThrow();
    for (const current of [
      { 'a.tsx': { '<Button>: Old Label': 3 } },
      { 'a.tsx': { '<Button>: New Label': 1 } },
      { 'b.tsx': { '<Button>: Old Label': 1 } },
      { 'a.tsx': { '<Button>: Old Label': -1 } },
    ])
      expect(() => assertShrinkOnly(current, previous)).toThrow(
        'may only shrink'
      );
  });

  it('allows exact legacy occurrences but rejects new or duplicated copy in the same file', () => {
    const baseline = require('./canonical-ui-label-casing.baseline.json');
    const [file, entries] = Object.entries(baseline).find(
      ([file, entries]) =>
        file.startsWith('components/') &&
        Object.keys(entries as object).some(key => key.startsWith('<Button>: '))
    ) as [string, Record<string, number>];
    const [key, count] = Object.entries(entries).find(([key]) =>
      key.startsWith('<Button>: ')
    )!;
    const text = key.slice('<Button>: '.length);
    const linter = new Linter();
    const lint = (copy: string) =>
      linter.verify(
        copy,
        [
          {
            files: ['**/*.tsx'],
            languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
            plugins: { jovie: { rules: { casing: rule } } },
            rules: { 'jovie/casing': 'error' },
          },
        ],
        { filename: path.resolve(import.meta.dirname, '..', file) }
      );
    const legacy = `<Button>{${JSON.stringify(text)}}</Button>`;
    expect(lint(legacy)).toHaveLength(0);
    expect(lint(legacy)).toHaveLength(0); // Allowances reset on every lint run.
    expect(lint(`<div>${legacy.repeat(count + 1)}</div>`)).toHaveLength(1);
    expect(lint('<Button>Brand New Action</Button>')).toHaveLength(1);
    expect(lint('<Button>Brand new action</Button>')).toHaveLength(0);
  });
});
