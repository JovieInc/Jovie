import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SystemBErrorFallback } from '@/components/providers/SystemBErrorFallback';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(
  appRoot,
  'components/providers/SystemBErrorFallback.tsx'
);
const designSystemPath = join(appRoot, 'styles/design-system.css');

const hashMark = String.fromCharCode(35);
const colorFunctionName = ['r', 'g', 'b', 'a'].join('');
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawAlphaColorPattern = new RegExp(`${colorFunctionName}\\s*\\(`, 'i');
const rawColorMixPattern = /color-mix\(/i;
const gradientPattern = ['linear', 'gradient|radial', 'gradient'].join('-');
const rawGradientPattern = new RegExp(gradientPattern, 'i');
const rawVisualUtilityPattern =
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[/;
const hardcodedSvgFillPattern = new RegExp(
  `fill=(['"])${hashMark}[\\da-fA-F]{3,8}\\1`
);

describe('SystemBErrorFallback', () => {
  it('renders one quiet error fallback with stable actions', () => {
    const reset = vi.fn();

    render(
      <SystemBErrorFallback
        description='An unexpected error occurred.'
        digest='digest-1'
        actions={[
          { type: 'button', label: 'Try Again', onClick: reset },
          { type: 'link', label: 'Go Home', href: '/', variant: 'secondary' },
        ]}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Something Went Wrong' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred.')
    ).toBeInTheDocument();
    expect(screen.getByText('Error ID: digest-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toHaveAttribute(
      'data-variant',
      'primary'
    );
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('keeps the shared primitive free of local visual token drift', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(rawColorMixPattern);
    expect(source).not.toMatch(rawGradientPattern);
    expect(source).not.toMatch(rawVisualUtilityPattern);
    expect(source).not.toMatch(hardcodedSvgFillPattern);
    expect(source).not.toContain('style={');
    expect(source).not.toContain('CSSProperties');
    expect(source).toContain('JOVIE_ICON_PATH');
    expect(source).toContain("fill='currentColor'");
    expect(source).toContain('system-b-error-fallback__action-link');
  });

  it('backs the primitive with System B tokens in the source of truth', async () => {
    const css = await readFile(designSystemPath, 'utf8');
    const block = css.match(
      /SYSTEM B ERROR FALLBACK PRIMITIVES[\s\S]*?\/\* ============================================\s+SYSTEM B PUBLIC PROFILE NOT FOUND PRIMITIVES/
    )?.[0];

    expect(block).toBeTruthy();
    expect(block).toContain('var(--system-b-bg-page)');
    expect(block).toContain('var(--system-b-text-primary)');
    expect(block).toContain('var(--color-btn-primary-bg)');
    expect(block).toContain('var(--color-btn-primary-fg)');
    expect(block).toContain('var(--system-b-radius-pill)');
    expect(block).toContain(':where(.system-b-error-fallback__actions)');
    expect(block).not.toMatch(hardcodedHashColorPattern);
    expect(block).not.toMatch(rawAlphaColorPattern);
    expect(block).not.toMatch(rawColorMixPattern);
    expect(block).not.toMatch(rawGradientPattern);
  });
});
