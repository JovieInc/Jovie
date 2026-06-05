import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { HeroClaimHandle } from '@/features/home/HeroClaimHandle';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const claimHandleSourcePaths = [
  'components/features/home/claim-handle/ClaimHandleForm.tsx',
  'components/features/home/HeroClaimHandle.tsx',
] as const;

const forbiddenLocalChromePatterns = [
  /rgba?\(/,
  /linear-gradient/,
  /boxShadow/,
  /backdropFilter/,
  /WebkitBackdropFilter/,
  /style=/,
  /\bgreen-/,
  /\b(?:bg|border|shadow)-\[/,
  /\btransition-all\b/,
  /hover:brightness/,
  /\b(?:scale|translate)-/,
] as const;

describe('ClaimHandleForm System B source contract', () => {
  it('renders the static hero claim form on System B primitives', () => {
    render(
      createElement(HeroClaimHandle, {
        submitButtonTestId: 'homepage-primary-cta',
      })
    );

    const button = screen.getByTestId('homepage-primary-cta');
    const form = button.closest('form');
    const row = form?.querySelector('.system-b-claim-handle-row');
    const input = screen.getByRole('textbox', { name: /choose your handle/i });

    expect(form).toHaveAttribute('action', '/signup');
    expect(row).toHaveAttribute('data-size', 'hero');
    expect(row).toHaveAttribute('data-available', 'false');
    expect(input).toHaveClass('system-b-claim-handle-input');
    expect(button).toHaveClass('system-b-claim-handle-button');
    expect(button).toHaveAttribute('data-disabled', 'false');
  });

  it('keeps claim-handle chrome on named System B primitives', () => {
    for (const sourcePath of claimHandleSourcePaths) {
      const source = readFileSync(resolve(appRoot, sourcePath), 'utf8');

      for (const pattern of forbiddenLocalChromePatterns) {
        expect(source, `${sourcePath} matched ${pattern}`).not.toMatch(pattern);
      }

      for (const className of [
        'system-b-claim-handle-row',
        'system-b-claim-handle-domain',
        'system-b-claim-handle-input',
        'system-b-claim-handle-button',
      ]) {
        expect(source).toContain(className);
      }

      for (const stateAttribute of [
        'data-size',
        'data-available',
        'data-disabled',
      ]) {
        expect(source).toContain(stateAttribute);
      }
    }

    const interactiveSource = readFileSync(
      resolve(
        appRoot,
        'components/features/home/claim-handle/ClaimHandleForm.tsx'
      ),
      'utf8'
    );
    expect(interactiveSource).toContain('system-b-claim-handle-helper');
    expect(interactiveSource).toContain('data-visible');
  });

  it('defines stable claim-handle visual states in the design system source of truth', () => {
    const styles = readFileSync(
      resolve(appRoot, 'styles/design-system.css'),
      'utf8'
    );

    for (const selector of [
      '.system-b-claim-handle-row',
      '.system-b-claim-handle-row[data-size="hero"]',
      '.system-b-claim-handle-row[data-size="display"]',
      '.system-b-claim-handle-row[data-available="true"]',
      '.system-b-claim-handle-domain',
      '.system-b-claim-handle-input',
      '.system-b-claim-handle-input[data-available="true"]',
      '.system-b-claim-handle-button',
      '.system-b-claim-handle-button[data-size="hero"]',
      '.system-b-claim-handle-button[data-size="display"]',
      '.system-b-claim-handle-button[data-disabled="true"]',
      '.system-b-claim-handle-helper',
      '.system-b-claim-handle-helper[data-visible="false"]',
    ]) {
      expect(styles).toContain(selector);
    }

    for (const stableDimension of [
      'min-height: 52px;',
      'min-height: 56px;',
      'min-height: 88px;',
      'height: 36px;',
      'height: 38px;',
      'height: 64px;',
      'min-height: 16px;',
    ]) {
      expect(styles).toContain(stableDimension);
    }
  });
});
