/**
 * Unit tests for the canonical-ui-label-casing ESLint rule.
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

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
    {
      filename,
      code: `<Button>Copy Profile Link</Button>`,
    },
    {
      filename,
      code: `<CardTitle>Grow Your Audience</CardTitle>`,
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
      code: `<span aria-label="Copy Profile Link" />`,
    },
    {
      // Hyphenated compounds: canonical Title Case keeps post-hyphen segments
      // lowercase ("Follow-up"). Regression — this exact form used to be
      // unsatisfiable (the word regex rejected every hyphenated word while
      // toCanonicalTitleCase produced this same string as the expected fix).
      filename,
      code: `const items = [{ label: 'Follow-up Delay (Hours)' }];`,
    },
    {
      filename,
      code: `const items = [{ label: 'Last Action' }];`,
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
      code: `<Button>Install iOS Alpha</Button>`,
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
    {
      filename,
      code: `<Button>copy profile link</Button>`,
      errors: [{ messageId: 'useTitleCase' }],
    },
    {
      filename,
      code: `<Button>Copy profile link</Button>`,
      errors: [{ messageId: 'useTitleCase' }],
    },
    {
      filename,
      code: `<Badge>LAST ACTION</Badge>`,
      errors: [{ messageId: 'useTitleCase' }],
    },
    {
      filename,
      code: `<CardDescription>Share Your Profile Link On Social Media.</CardDescription>`,
      errors: [{ messageId: 'useSentenceCase' }],
    },
    {
      filename,
      code: `<input aria-label="go back" />`,
      errors: [{ messageId: 'useTitleCase' }],
    },
    {
      filename,
      code: `const columns = [{ header: 'last action' }];`,
      errors: [{ messageId: 'useTitleCase' }],
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
