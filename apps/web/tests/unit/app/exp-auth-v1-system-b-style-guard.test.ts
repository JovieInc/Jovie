import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath = 'app/exp/auth-v1/page.tsx';

const forbiddenButtonMotionPatterns = [
  /\bhover:scale(?:-\[[^\]]+\]|-\d+)?\b/,
  /\bhover:translate(?:-\[[^\]]+\]|-[a-z0-9/[\].-]+)?\b/,
  /\bhover:-translate(?:-\[[^\]]+\]|-[a-z0-9/[\].-]+)?\b/,
  /\bgroup-hover:scale(?:-\[[^\]]+\]|-\d+)?\b/,
  /\btransition-all\b/,
  /\btransition-transform\b/,
  /\btransition-\[[^\]]*transform[^\]]*\]/,
  /\bduration-\d+\b/,
];

const forbiddenLocalPrimaryPatterns = [
  /\bbg-white\b/,
  /\btext-black\b/,
  /\bshadow-\[/,
  /\bhover:brightness-/,
  /\btext-\[\d/,
];

function authButtonClassNames(source: string) {
  return Array.from(
    source.matchAll(
      /'inline-flex h-\(--linear-button-height-md\) min-h-\(--linear-button-height-md\)[^']+'/g
    )
  ).map(match => match[0]);
}

describe('exp auth v1 System B style guard', () => {
  it('keeps auth button feedback token-backed and non-positional', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');
    const buttonClassNames = authButtonClassNames(source);

    expect(buttonClassNames).toHaveLength(2);

    for (const className of buttonClassNames) {
      const offenders = forbiddenButtonMotionPatterns
        .filter(pattern => pattern.test(className))
        .map(pattern => pattern.toString());

      expect(
        offenders,
        `${sourcePath} leaked button motion drift: ${offenders.join(', ')}`
      ).toEqual([]);
      expect(className).toContain(
        'transition-[background-color,border-color,color,box-shadow,opacity]'
      );
      expect(className).toContain('duration-subtle');
      expect(className).toContain('active:opacity-90');
      expect(className).toContain('h-(--linear-button-height-md)');
      expect(className).toContain('min-h-(--linear-button-height-md)');
      expect(className).toContain('px-(--linear-space-4)');
      expect(className).toContain('text-caption');
      expect(className).toContain('font-caption');
    }

    const primaryButton = buttonClassNames.find(className =>
      className.includes('bg-(--linear-btn-primary-bg)')
    );
    const secondaryButton = buttonClassNames.find(className =>
      className.includes('bg-(--linear-btn-secondary-bg)')
    );

    expect(primaryButton).toBeTruthy();
    expect(secondaryButton).toBeTruthy();

    for (const pattern of forbiddenLocalPrimaryPatterns) {
      expect(primaryButton, `${sourcePath} leaked ${pattern}`).not.toMatch(
        pattern
      );
    }

    expect(primaryButton).toContain('border-(--linear-btn-primary-border)');
    expect(primaryButton).toContain('text-(--linear-btn-primary-fg)');
    expect(primaryButton).toContain('shadow-(--linear-shadow-button)');
    expect(secondaryButton).toContain('border-subtle');
    expect(secondaryButton).toContain(
      'hover:bg-(--linear-btn-secondary-hover)'
    );
  });
});
