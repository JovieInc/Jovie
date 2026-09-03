import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Banner } from '@/components/feedback/Banner';
import {
  BANNER_SHELL_GEOMETRY_CLASS,
  BANNER_VARIANT_CONTAINER,
  BANNER_VARIANT_ICON_COLOR,
} from '@/components/feedback/banner-semantic-contract';

const webRoot = path.resolve(__dirname, '../../../..');
const bannerSourcePath = path.join(webRoot, 'components/feedback/Banner.tsx');
const contractSourcePath = path.join(
  webRoot,
  'components/feedback/banner-semantic-contract.ts'
);

const BANNER_RAW_PALETTE_FIXTURE_SOURCE = `
const variantClasses = {
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-red-50 border-red-200 text-red-800',
};
`;

const RAW_PALETTE_PATTERN =
  /\b(?:bg|border|text|ring|from|via|to|outline|fill|stroke|decoration)-(?:red|blue|green|yellow|amber|orange|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3}|\/)/;

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function hasRawPaletteDrift(source: string): boolean {
  return RAW_PALETTE_PATTERN.test(source);
}

describe('Banner semantic feedback surface', () => {
  it('keeps production source on approved info/success/warning/error tokens', () => {
    const bannerSource = readSource(bannerSourcePath);
    const contractSource = readSource(contractSourcePath);

    expect(hasRawPaletteDrift(bannerSource)).toBe(false);
    expect(hasRawPaletteDrift(contractSource)).toBe(false);
    expect(bannerSource).toContain('BANNER_VARIANT_CONTAINER');
    expect(contractSource).toContain('bg-warning-subtle');
    expect(contractSource).toContain('border-warning/30');
    expect(contractSource).toContain('text-warning');
  });

  it('renders the default info status with canonical geometry', () => {
    render(
      <Banner
        title='Maintenance tonight'
        description='Imports pause at 10 PM.'
        testId='banner'
      />
    );

    const banner = screen.getByTestId('banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('data-variant', 'info');
    expect(banner).toHaveClass(
      ...BANNER_SHELL_GEOMETRY_CLASS.split(' '),
      ...BANNER_VARIANT_CONTAINER.info.split(' ')
    );
    expect(screen.getByText('Maintenance tonight')).toBeInTheDocument();
    expect(screen.getByText('Imports pause at 10 PM.')).toBeInTheDocument();
  });

  it('applies semantic tokens for success, warning, and error without changing geometry', () => {
    const variants = ['success', 'warning', 'error'] as const;
    const { rerender } = render(
      <Banner title='Status changed' variant='success' testId='banner' />
    );

    for (const variant of variants) {
      rerender(
        <Banner title='Status changed' variant={variant} testId='banner' />
      );

      const banner = screen.getByTestId('banner');
      const icon = banner.querySelector('svg');

      expect(banner.className.split(/\s+/)).toEqual(
        expect.arrayContaining(BANNER_SHELL_GEOMETRY_CLASS.split(' '))
      );
      expect(banner).toHaveClass(
        ...BANNER_VARIANT_CONTAINER[variant].split(' ')
      );
      expect(icon).not.toBeNull();
      expect(icon as SVGElement).toHaveClass(
        ...BANNER_VARIANT_ICON_COLOR[variant].split(' ')
      );
      expect(banner).toHaveAttribute(
        'role',
        variant === 'error' ? 'alert' : 'status'
      );
      expect(banner).toHaveAttribute(
        'aria-live',
        variant === 'error' ? 'assertive' : 'polite'
      );
    }
  });

  it('keeps action and dismiss controls on stable button targets', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Banner
        title='Import complete'
        action={{ label: 'Review', onClick: onAction }}
        onDismiss={onDismiss}
      />
    );

    const action = screen.getByRole('button', { name: 'Review' });
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });

    fireEvent.click(action);
    fireEvent.click(dismiss);

    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(action).toHaveAttribute('data-size', 'sm');
    expect(action.className).toContain('before:h-11');
    expect(dismiss).toHaveAttribute('data-size', 'icon-sm');
    expect(dismiss.className).toContain('before:h-11');
    expect(dismiss.className).toContain('before:w-11');
  });

  it('rejects the deliberate raw-palette banner fixture', () => {
    expect(hasRawPaletteDrift(BANNER_RAW_PALETTE_FIXTURE_SOURCE)).toBe(true);
    expect(BANNER_RAW_PALETTE_FIXTURE_SOURCE).toContain('bg-green-50');
    expect(BANNER_RAW_PALETTE_FIXTURE_SOURCE).toContain('bg-amber-50');
    expect(BANNER_RAW_PALETTE_FIXTURE_SOURCE).toContain('bg-red-50');
    expect(readSource(bannerSourcePath)).not.toContain(
      'BANNER_RAW_PALETTE_FIXTURE_SOURCE'
    );
  });
});
