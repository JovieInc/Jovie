import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  auditBadgeSource,
  BADGE_DRIFT_CLASSES,
  codesOf,
} from '../lib/badge-geometry-audit';
import {
  BADGE_SHARED_GEOMETRY_CLASS,
  BADGE_SIZE_GEOMETRY,
} from '../lib/badge-geometry-contract';
import { Badge, badgeVariants } from './badge';
import {
  BADGE_BLUE_HOVER_FIXTURE_SOURCE,
  BADGE_BLUE_HOVER_FIXTURE_TEST_ID,
  BADGE_GEOMETRY_SHIFT_FIXTURE_SOURCE,
  BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID,
  BADGE_OVERFLOW_FIXTURE_SOURCE,
  BADGE_OVERFLOW_FIXTURE_TEST_ID,
  BadgeBlueHoverDriftFixture,
  BadgeGeometryShiftDriftFixture,
  BadgeOverflowDriftFixture,
} from './fixtures/badge-geometry-drift-fixtures';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const badgeSourcePath = path.join(packageRoot, 'atoms/badge.tsx');
const contractSourcePath = path.join(
  packageRoot,
  'lib/badge-geometry-contract.ts'
);
const fixtureSourcePath = path.join(
  packageRoot,
  'atoms/fixtures/badge-geometry-drift-fixtures.tsx'
);

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('Badge', () => {
  describe('Basic Rendering', () => {
    it('renders with text content', () => {
      render(<Badge>New</Badge>);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('renders as span element', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.tagName).toBe('SPAN');
    });

    it('forwards refs correctly', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Badge ref={ref}>New</Badge>);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('has correct displayName', () => {
      expect(Badge.displayName).toBe('Badge');
    });
  });

  describe('Variants', () => {
    it('applies the default variant and stable border geometry', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-(--color-bg-primary)');
      expect(badge.className).toContain('text-(--linear-text-primary)');
      expect(badge.className).toContain('border');
      expect(badge).toHaveAttribute('data-variant', 'default');
      expect(badge).toHaveAttribute('data-size', 'md');
    });

    it('applies secondary variant explicitly', () => {
      render(
        <Badge variant='secondary' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-(--color-bg-primary)');
      expect(badge.className).toContain('text-(--linear-text-tertiary)');
    });

    it('applies success variant', () => {
      render(
        <Badge variant='success' data-testid='badge'>
          Active
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-(--color-success-subtle)');
      expect(badge.className).toContain('text-success');
      expect(badge.className).toContain('border-success/20');
    });

    it('applies warning variant', () => {
      render(
        <Badge variant='warning' data-testid='badge'>
          Pending
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-(--color-warning-subtle)');
      expect(badge.className).toContain('text-warning');
    });

    it('applies error variant', () => {
      render(
        <Badge variant='error' data-testid='badge'>
          Failed
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('bg-(--color-error-subtle)');
      expect(badge.className).toContain('text-error');
    });

    it('applies neutral tone overrides', () => {
      render(
        <Badge tone='neutral' data-testid='badge'>
          Neutral
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('border-subtle');
      expect(badge.className).toContain('text-tertiary-token');
    });

    it('applies accent tone overrides', () => {
      render(
        <Badge tone='accent' data-testid='badge'>
          Accent
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('border-accent/20');
      expect(badge.className).toContain('text-accent');
      expect(badge).toHaveAttribute('data-tone', 'accent');
    });
  });

  describe('Sizes', () => {
    it('applies md size by default', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-xs');
      expect(badge.className).toContain('leading-5');
      expect(badge.className).toContain('px-2');
    });

    it('applies sm size', () => {
      render(
        <Badge size='sm' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-3xs');
      expect(badge.className).toContain('leading-5');
      expect(badge.className).toContain('px-1.5');
    });

    it('applies lg size', () => {
      render(
        <Badge size='lg' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('text-xs');
      expect(badge.className).toContain('leading-5');
      expect(badge.className).toContain('px-2.5');
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('inline-flex');
      expect(badge.className).toContain('items-center');
      expect(badge.className).toContain('justify-center');
      expect(badge.className).toContain('gap-1');
      expect(badge.className).toContain('rounded-(--system-b-radius-pill)');
      expect(badge.className).toContain('whitespace-normal');
      expect(badge.className).toContain('break-words');
      expect(badge.className).toContain('font-medium');
      expect(badge.className).toContain('tracking-tight');
    });

    it('wraps long destructive labels instead of overlapping adjacent content', () => {
      render(
        <div className='w-24' data-testid='constraint'>
          <Badge variant='destructive' data-testid='badge'>
            Destructive Action Unavailable
          </Badge>
        </div>
      );

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass(
        'max-w-full',
        'min-w-0',
        'whitespace-normal',
        'break-words',
        'rounded-(--system-b-radius-pill)'
      );
      expect(badge).not.toHaveClass(
        'whitespace-nowrap',
        'overflow-hidden',
        'truncate'
      );
      expect(badge.className).toContain('bg-(--color-error-subtle)');
      expect(badge.className).toContain('text-error');
    });

    it('keeps hover color neutral unless a semantic variant explicitly owns it', () => {
      const blueHoverPattern =
        /hover:(?:bg|text|border)-(?:blue|cyan|sky|indigo)(?:-|\/|\b)/;

      for (const variant of [
        'default',
        'secondary',
        'destructive',
        'outline',
        'success',
        'warning',
      ] as const) {
        expect(badgeVariants({ variant })).not.toMatch(blueHoverPattern);
      }
    });

    it('applies focus-visible ring for accessibility', () => {
      render(<Badge data-testid='badge'>New</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('focus-visible:ring-2');
      expect(badge.className).toContain('focus-visible:outline-none');
    });

    it('merges custom className', () => {
      render(
        <Badge className='custom-class' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge.className).toContain('custom-class');
      expect(badge.className).toContain('rounded-(--system-b-radius-pill)');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <Badge id='custom-id' title='Badge title' data-testid='badge'>
          New
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('id', 'custom-id');
      expect(badge).toHaveAttribute('title', 'Badge title');
    });

    it('supports onClick handler', () => {
      const onClick = vi.fn();
      render(
        <Badge onClick={onClick} data-testid='badge'>
          Clickable
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      badge.click();
      expect(onClick).toHaveBeenCalled();
    });
  });

  describe('Content', () => {
    it('renders with icon and text', () => {
      render(
        <Badge data-testid='badge'>
          <span data-testid='icon'>★</span>
          Featured
        </Badge>
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Featured')).toBeInTheDocument();
    });

    it('renders numeric content', () => {
      render(<Badge>42</Badge>);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders empty badge', () => {
      render(<Badge data-testid='badge' />);
      const badge = screen.getByTestId('badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toBeEmptyDOMElement();
    });

    it('applies permission-restricted state', () => {
      render(
        <Badge variant='permission-restricted' data-testid='badge'>
          Admin only
        </Badge>
      );

      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('data-state', 'permission-restricted');
      expect(badge.className).toContain('bg-(--state-permission-bg)');
    });
  });
});

describe('Badge canonical geometry ownership', () => {
  it('keeps production source on approved wrap and pill geometry', () => {
    const badgeSource = readSource(badgeSourcePath);
    const contractSource = readSource(contractSourcePath);

    expect(codesOf(auditBadgeSource(badgeSource))).toEqual([]);
    expect(codesOf(auditBadgeSource(contractSource))).toEqual([]);
    expect(BADGE_DRIFT_CLASSES).toEqual([
      'label-overflow',
      'blue-hover',
      'geometry-shift',
    ]);

    expect(badgeSource).toContain('BADGE_SHARED_GEOMETRY_CLASS');
    expect(badgeSource).toContain('BADGE_SIZE_GEOMETRY');
    expect(badgeSource).not.toContain('badge-geometry-drift-fixtures');
    expect(badgeSource).not.toMatch(/whitespace-nowrap/);
    expect(contractSource).toContain('rounded-(--system-b-radius-pill)');
    expect(contractSource).toContain('whitespace-normal');
    expect(contractSource).toContain('break-words');
    expect(contractSource).toContain('font-medium');
    expect(contractSource).toContain('tracking-tight');
    expect(BADGE_SHARED_GEOMETRY_CLASS).toContain(
      'rounded-(--system-b-radius-pill)'
    );
    expect(BADGE_SIZE_GEOMETRY.sm).toContain('leading-5');
    expect(BADGE_SIZE_GEOMETRY.md).toContain('text-xs');
    expect(BADGE_SIZE_GEOMETRY.md).toContain('leading-5');
  });
});

describe('Badge deliberate-red drift fixtures', () => {
  it('rejects the label-overflow fixture', () => {
    expect(codesOf(auditBadgeSource(BADGE_OVERFLOW_FIXTURE_SOURCE))).toEqual([
      'label-overflow',
    ]);

    render(<BadgeOverflowDriftFixture />);
    const fixture = screen.getByTestId(BADGE_OVERFLOW_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass(
      'whitespace-nowrap',
      'overflow-hidden',
      'truncate'
    );
    expect(readSource(badgeSourcePath)).not.toContain(
      BADGE_OVERFLOW_FIXTURE_TEST_ID
    );
  });

  it('rejects the blue-hover fixture', () => {
    expect(codesOf(auditBadgeSource(BADGE_BLUE_HOVER_FIXTURE_SOURCE))).toEqual([
      'blue-hover',
    ]);

    render(<BadgeBlueHoverDriftFixture />);
    const fixture = screen.getByTestId(BADGE_BLUE_HOVER_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toContain('hover:bg-blue-100');
    expect(fixture.className).toContain('hover:text-blue-900');
    expect(readSource(badgeSourcePath)).not.toContain(
      BADGE_BLUE_HOVER_FIXTURE_TEST_ID
    );
  });

  it('rejects the geometry-shift fixture', () => {
    expect(
      codesOf(auditBadgeSource(BADGE_GEOMETRY_SHIFT_FIXTURE_SOURCE))
    ).toEqual(['geometry-shift']);

    render(<BadgeGeometryShiftDriftFixture />);
    const fixture = screen.getByTestId(BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toMatch(/\bpx-6\b/);
    expect(fixture.className).toMatch(/\brounded-none\b/);
    expect(readSource(badgeSourcePath)).not.toContain(
      BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID
    );
    expect(readSource(fixtureSourcePath)).toContain('data-deliberate-red');
  });
});
