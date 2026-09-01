import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoBox } from '@/components/molecules/InfoBox';
import {
  INFOBOX_CONTENT_GEOMETRY_CLASS,
  INFOBOX_INLINE_GEOMETRY_CLASS,
  INFOBOX_INLINE_SEMANTIC_SURFACE,
  INFOBOX_SEMANTIC_FOREGROUND,
  INFOBOX_SEMANTIC_SURFACE,
  INFOBOX_SHARED_GEOMETRY_CLASS,
  INFOBOX_TITLE_GEOMETRY_CLASS,
} from '@/components/molecules/info-box-semantic-contract';
import {
  auditInfoBoxSource,
  codesOf,
  INFOBOX_DRIFT_CLASSES,
} from './info-box-semantic-audit';
import {
  INFOBOX_BLUE_HOVER_FIXTURE_SOURCE,
  INFOBOX_BLUE_HOVER_FIXTURE_TEST_ID,
  INFOBOX_GEOMETRY_SHIFT_FIXTURE_SOURCE,
  INFOBOX_GEOMETRY_SHIFT_FIXTURE_TEST_ID,
  INFOBOX_RAW_PALETTE_FIXTURE_SOURCE,
  INFOBOX_RAW_PALETTE_FIXTURE_TEST_ID,
  InfoBoxBlueHoverDriftFixture,
  InfoBoxGeometryShiftDriftFixture,
  InfoBoxRawPaletteDriftFixture,
} from './info-box-semantic-drift-fixtures';

const webRoot = path.resolve(__dirname, '../..');
const infoBoxSourcePath = path.join(
  webRoot,
  'components/molecules/InfoBox.tsx'
);
const contractSourcePath = path.join(
  webRoot,
  'components/molecules/info-box-semantic-contract.ts'
);
const chatUsageAlertSourcePath = path.join(
  webRoot,
  'components/jovie/components/ChatUsageAlert.tsx'
);
const fixtureSourcePath = path.join(
  __dirname,
  'info-box-semantic-drift-fixtures.tsx'
);

const VARIANTS = ['info', 'warning', 'success', 'error'] as const;

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function getRootFromTitle(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  const root = heading.closest('div');
  if (!root) {
    throw new Error(`Could not find InfoBox root for title: ${title}`);
  }
  return root;
}

describe('InfoBox semantic color ownership', () => {
  it('keeps production source on approved info/warning/success/error tokens', () => {
    const infoBoxSource = readSource(infoBoxSourcePath);
    const contractSource = readSource(contractSourcePath);

    expect(codesOf(auditInfoBoxSource(infoBoxSource))).toEqual([]);
    expect(codesOf(auditInfoBoxSource(contractSource))).toEqual([]);
    expect(INFOBOX_DRIFT_CLASSES).toEqual([
      'raw-palette',
      'blue-hover',
      'geometry-shift',
    ]);

    expect(infoBoxSource).toContain('INFOBOX_SEMANTIC_SURFACE');
    expect(infoBoxSource).toContain('INFOBOX_SEMANTIC_FOREGROUND');
    expect(infoBoxSource).not.toContain('info-box-semantic-drift-fixtures');
    expect(infoBoxSource).not.toMatch(/hover:bg-blue/);
    expect(contractSource).toContain('bg-info-subtle');
    expect(contractSource).toContain('bg-warning-subtle');
    expect(contractSource).toContain('bg-success-subtle');
    expect(contractSource).toContain('bg-error-subtle');
    expect(contractSource).toContain('text-info');
    expect(contractSource).toContain('text-warning');
    expect(contractSource).toContain('text-success');
    expect(contractSource).toContain('text-error');
  });

  it('renders title and content with the default info tokens', () => {
    render(
      <InfoBox title='Information'>
        <p>Test content</p>
      </InfoBox>
    );

    const container = getRootFromTitle('Information');
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(container).toHaveAttribute('role', 'status');
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(container).toHaveAttribute('data-presentation', 'box');
    expect(container).toHaveClass(
      ...INFOBOX_SHARED_GEOMETRY_CLASS.split(' '),
      ...INFOBOX_SEMANTIC_SURFACE.info.split(' ')
    );
    expect(screen.getByRole('heading', { name: 'Information' })).toHaveClass(
      ...INFOBOX_TITLE_GEOMETRY_CLASS.split(' '),
      INFOBOX_SEMANTIC_FOREGROUND.info
    );
  });

  it('applies semantic tokens for every variant without changing geometry', () => {
    const { rerender } = render(
      <InfoBox title='Status' variant='info'>
        <p>Same copy</p>
      </InfoBox>
    );

    const geometry = new Set(INFOBOX_SHARED_GEOMETRY_CLASS.split(' '));

    for (const variant of VARIANTS) {
      rerender(
        <InfoBox title='Status' variant={variant}>
          <p>Same copy</p>
        </InfoBox>
      );

      const container = getRootFromTitle('Status');
      const heading = screen.getByRole('heading', { name: 'Status' });
      const content = screen.getByText('Same copy').parentElement;

      expect(container.className.split(/\s+/)).toEqual(
        expect.arrayContaining([...geometry])
      );
      expect(container).toHaveClass(
        ...INFOBOX_SEMANTIC_SURFACE[variant].split(' ')
      );
      expect(heading).toHaveClass(
        ...INFOBOX_TITLE_GEOMETRY_CLASS.split(' '),
        INFOBOX_SEMANTIC_FOREGROUND[variant]
      );
      expect(content).toHaveClass(
        ...INFOBOX_CONTENT_GEOMETRY_CLASS.split(' '),
        INFOBOX_SEMANTIC_FOREGROUND[variant]
      );
      expect(container).toHaveAttribute(
        'role',
        variant === 'error' ? 'alert' : 'status'
      );
      expect(container).toHaveAttribute(
        'aria-live',
        variant === 'error' ? 'assertive' : 'polite'
      );
      expect(container.className).not.toMatch(/hover:bg-blue/);
      expect(container.className).not.toMatch(
        /\b(?:bg|border|text)-(?:red|blue|green|yellow)-\d+/
      );
    }
  });

  it('renders without a title when omitted', () => {
    render(
      <InfoBox>
        <p>Content only</p>
      </InfoBox>
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Content only')).toBeInTheDocument();
  });

  it('renders inline notices with semantic status ownership and stable inline geometry', () => {
    const { rerender } = render(
      <InfoBox presentation='inline' variant='error' testId='inline-notice'>
        Import failed. Try again.
      </InfoBox>
    );

    const notice = screen.getByTestId('inline-notice');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice).toHaveAttribute('aria-live', 'assertive');
    expect(notice).toHaveAttribute('data-presentation', 'inline');
    expect(notice).toHaveClass(
      ...INFOBOX_INLINE_GEOMETRY_CLASS.split(' '),
      ...INFOBOX_INLINE_SEMANTIC_SURFACE.error.split(' ')
    );
    expect(notice).not.toHaveClass(...INFOBOX_SHARED_GEOMETRY_CLASS.split(' '));

    rerender(
      <InfoBox presentation='inline' variant='success' testId='inline-notice'>
        Import complete.
      </InfoBox>
    );

    const successNotice = screen.getByTestId('inline-notice');
    expect(successNotice).toHaveAttribute('role', 'status');
    expect(successNotice).toHaveAttribute('aria-live', 'polite');
    expect(successNotice).toHaveClass(
      ...INFOBOX_INLINE_GEOMETRY_CLASS.split(' '),
      ...INFOBOX_INLINE_SEMANTIC_SURFACE.success.split(' ')
    );
  });

  it('prevents InfoBox callers from overriding warning/error semantic surfaces', () => {
    const chatUsageAlertSource = readSource(chatUsageAlertSourcePath);

    expect(chatUsageAlertSource).toContain('InfoBox');
    expect(chatUsageAlertSource).not.toContain(
      'bg-(--app-shell-content-surface)'
    );
    expect(chatUsageAlertSource).not.toContain(
      'border-(--app-shell-frame-seam)'
    );
  });

  it('merges custom className into the container', () => {
    render(
      <InfoBox className='custom-info'>
        <p>Custom content</p>
      </InfoBox>
    );

    const container = screen
      .getByText('Custom content')
      .closest('div')?.parentElement;
    expect(container).toHaveClass('custom-info');
  });
});

describe('InfoBox deliberate-red drift fixtures', () => {
  it('rejects the raw-palette fixture', () => {
    expect(
      codesOf(auditInfoBoxSource(INFOBOX_RAW_PALETTE_FIXTURE_SOURCE))
    ).toEqual(['raw-palette']);

    render(<InfoBoxRawPaletteDriftFixture />);
    const fixture = screen.getByTestId(INFOBOX_RAW_PALETTE_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass(
      'bg-blue-50',
      'border-blue-200',
      'text-blue-900'
    );
    expect(readSource(infoBoxSourcePath)).not.toContain(
      INFOBOX_RAW_PALETTE_FIXTURE_TEST_ID
    );
  });

  it('rejects the blue-hover fixture', () => {
    expect(
      codesOf(auditInfoBoxSource(INFOBOX_BLUE_HOVER_FIXTURE_SOURCE))
    ).toEqual(['blue-hover']);

    render(<InfoBoxBlueHoverDriftFixture />);
    const fixture = screen.getByTestId(INFOBOX_BLUE_HOVER_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toContain('hover:bg-blue-100');
    expect(fixture.className).toContain('hover:text-blue-900');
    expect(readSource(infoBoxSourcePath)).not.toContain(
      INFOBOX_BLUE_HOVER_FIXTURE_TEST_ID
    );
  });

  it('rejects the geometry-shift fixture', () => {
    expect(
      codesOf(auditInfoBoxSource(INFOBOX_GEOMETRY_SHIFT_FIXTURE_SOURCE))
    ).toEqual(['geometry-shift']);

    render(<InfoBoxGeometryShiftDriftFixture />);
    const fixture = screen.getByTestId(INFOBOX_GEOMETRY_SHIFT_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toMatch(/\bp-6\b/);
    expect(fixture.className).toMatch(/\bmt-4\b/);
    expect(readSource(infoBoxSourcePath)).not.toContain(
      INFOBOX_GEOMETRY_SHIFT_FIXTURE_TEST_ID
    );
    expect(readSource(fixtureSourcePath)).toContain('data-deliberate-red');
  });
});
