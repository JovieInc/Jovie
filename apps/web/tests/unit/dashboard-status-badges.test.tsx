import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceIntentBadge } from '@/features/dashboard/atoms/AudienceIntentBadge';
import {
  CONFIDENCE_THRESHOLDS,
  ConfidenceBadge,
  getConfidenceLevel,
} from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  AUDIENCE_INTENT_BADGE_STYLES,
  CONFIDENCE_BADGE_STYLES,
  MATCH_STATUS_BADGE_STYLES,
} from '@/features/dashboard/atoms/dashboard-status-badge-semantic-contract';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import {
  auditStatusBadgeSource,
  codesOf,
  STATUS_BADGE_DRIFT_CLASSES,
} from './dashboard-status-badge-semantic-audit';
import {
  STATUS_BADGE_BLUE_HOVER_FIXTURE_SOURCE,
  STATUS_BADGE_BLUE_HOVER_FIXTURE_TEST_ID,
  STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_SOURCE,
  STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_TEST_ID,
  STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_SOURCE,
  STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID,
  STATUS_BADGE_RAW_PALETTE_FIXTURE_SOURCE,
  STATUS_BADGE_RAW_PALETTE_FIXTURE_TEST_ID,
  StatusBadgeBlueHoverDriftFixture,
  StatusBadgeClippingNowrapDriftFixture,
  StatusBadgeGeometryShiftDriftFixture,
  StatusBadgeRawPaletteDriftFixture,
} from './dashboard-status-badge-semantic-drift-fixtures';

const webRoot = path.resolve(__dirname, '../..');
const atomsRoot = path.join(webRoot, 'components/features/dashboard/atoms');
const productionSourcePaths = [
  path.join(atomsRoot, 'ConfidenceBadge.tsx'),
  path.join(atomsRoot, 'MatchStatusBadge.tsx'),
  path.join(atomsRoot, 'AudienceIntentBadge.tsx'),
  path.join(atomsRoot, 'dashboard-status-badge-semantic-contract.ts'),
] as const;
const fixtureSourcePath = path.join(
  __dirname,
  'dashboard-status-badge-semantic-drift-fixtures.tsx'
);

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function getBadgeRoot(text: string): HTMLElement {
  const node = screen.getByText(text);
  const root = node.closest('span.inline-flex');
  if (!(root instanceof HTMLElement)) {
    throw new Error(`Could not find DotBadge root for label: ${text}`);
  }
  return root;
}

function getDot(root: HTMLElement): HTMLElement {
  const dot = root.querySelector('[aria-hidden]');
  if (!(dot instanceof HTMLElement)) {
    throw new Error('Could not find DotBadge indicator');
  }
  return dot;
}

describe('dashboard status badge semantic ownership', () => {
  it('keeps production sources on approved semantic tokens and DotBadge', () => {
    for (const sourcePath of productionSourcePaths) {
      const source = readSource(sourcePath);
      expect(codesOf(auditStatusBadgeSource(source)), sourcePath).toEqual([]);
      expect(source).not.toContain('dashboard-status-badge-semantic-drift');
      expect(source).not.toContain('data-deliberate-red');
      expect(source).not.toMatch(/hover:bg-blue/);
    }

    expect(STATUS_BADGE_DRIFT_CLASSES).toEqual([
      'raw-palette',
      'blue-hover',
      'clipping-nowrap',
      'geometry-shift',
    ]);

    const contractSource = readSource(productionSourcePaths[3]);
    expect(contractSource).toContain('border-success/20');
    expect(contractSource).toContain('border-warning/20');
    expect(contractSource).toContain('border-error/20');
    expect(contractSource).toContain('border-info/20');
    expect(contractSource).toContain('text-success');
    expect(contractSource).toContain('text-warning');
    expect(contractSource).toContain('text-error');
    expect(contractSource).toContain('text-info');
    expect(contractSource).toContain('text-tertiary-token');
    expect(contractSource).toContain('text-secondary-token');
  });

  it('maps confidence scores onto source-backed success/warning/error roles', () => {
    expect(getConfidenceLevel(CONFIDENCE_THRESHOLDS.high)).toBe('high');
    expect(getConfidenceLevel(0.79)).toBe('medium');
    expect(getConfidenceLevel(CONFIDENCE_THRESHOLDS.medium)).toBe('medium');
    expect(getConfidenceLevel(0.49)).toBe('low');

    const { rerender } = render(<ConfidenceBadge score={0.85} />);
    let root = getBadgeRoot('85%');
    expect(root).toHaveClass(
      ...CONFIDENCE_BADGE_STYLES.high.className.split(' ')
    );
    expect(getDot(root)).toHaveClass(CONFIDENCE_BADGE_STYLES.high.dotClassName);

    rerender(<ConfidenceBadge score={0.65} />);
    root = getBadgeRoot('65%');
    expect(root).toHaveClass(
      ...CONFIDENCE_BADGE_STYLES.medium.className.split(' ')
    );

    rerender(<ConfidenceBadge score={0.2} />);
    root = getBadgeRoot('20%');
    expect(root).toHaveClass(
      ...CONFIDENCE_BADGE_STYLES.low.className.split(' ')
    );
  });

  it('maps match statuses onto source-backed info/success/neutral roles', () => {
    const { rerender } = render(<MatchStatusBadge status='suggested' />);
    for (const status of [
      'suggested',
      'confirmed',
      'auto_confirmed',
      'rejected',
    ] as const) {
      rerender(<MatchStatusBadge status={status} />);
      const style = MATCH_STATUS_BADGE_STYLES[status];
      const root = getBadgeRoot(style.label);
      expect(root).toHaveClass(...style.className.split(' '));
      expect(getDot(root)).toHaveClass(style.dotClassName);
      expect(root.className).not.toMatch(/hover:bg-blue/);
      expect(root.className).not.toMatch(
        /\b(?:bg|border|text)-(?:red|blue|green|yellow)-\d+/
      );
    }
  });

  it('maps audience intent onto source-backed secondary/tertiary roles', () => {
    const { rerender } = render(<AudienceIntentBadge intentLevel='high' />);
    for (const intentLevel of ['high', 'medium', 'low'] as const) {
      rerender(<AudienceIntentBadge intentLevel={intentLevel} />);
      const style = AUDIENCE_INTENT_BADGE_STYLES[intentLevel];
      const root = getBadgeRoot(style.label);
      expect(root).toHaveClass(...style.className.split(' '));
      expect(getDot(root)).toHaveClass(style.dotClassName);
    }
  });

  it('keeps long labels legible through canonical Badge wrap geometry', () => {
    render(
      <>
        <MatchStatusBadge status='auto_confirmed' />
        <ConfidenceBadge score={0.91} showLabel />
        <AudienceIntentBadge intentLevel='medium' />
      </>
    );

    const autoConfirmed = getBadgeRoot(
      MATCH_STATUS_BADGE_STYLES.auto_confirmed.label
    );
    const confidence = getBadgeRoot('91%');
    const intent = getBadgeRoot(AUDIENCE_INTENT_BADGE_STYLES.medium.label);

    for (const root of [autoConfirmed, confidence, intent]) {
      expect(root).toHaveClass('whitespace-normal');
      expect(root).toHaveClass('break-words');
      expect(root.className).not.toMatch(/\boverflow-hidden\b/);
      expect(root.className).not.toMatch(/\btruncate\b/);
      expect(root.className).not.toMatch(/\bwhitespace-nowrap\b/);
    }

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(
      screen.getByText(MATCH_STATUS_BADGE_STYLES.auto_confirmed.label)
    ).toBeInTheDocument();
  });
});

describe('dashboard status badge deliberate-red drift fixtures', () => {
  it('rejects the raw-palette fixture', () => {
    expect(
      codesOf(auditStatusBadgeSource(STATUS_BADGE_RAW_PALETTE_FIXTURE_SOURCE))
    ).toEqual(['raw-palette']);

    render(<StatusBadgeRawPaletteDriftFixture />);
    const fixture = screen.getByTestId(
      STATUS_BADGE_RAW_PALETTE_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass(
      'bg-blue-50',
      'border-blue-200',
      'text-blue-900'
    );
    for (const sourcePath of productionSourcePaths) {
      expect(readSource(sourcePath)).not.toContain(
        STATUS_BADGE_RAW_PALETTE_FIXTURE_TEST_ID
      );
    }
  });

  it('rejects the accidental blue-hover fixture', () => {
    expect(
      codesOf(auditStatusBadgeSource(STATUS_BADGE_BLUE_HOVER_FIXTURE_SOURCE))
    ).toEqual(['blue-hover']);

    render(<StatusBadgeBlueHoverDriftFixture />);
    const fixture = screen.getByTestId(STATUS_BADGE_BLUE_HOVER_FIXTURE_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toContain('hover:bg-blue-100');
    expect(fixture.className).toContain('hover:text-blue-900');
    for (const sourcePath of productionSourcePaths) {
      expect(readSource(sourcePath)).not.toContain(
        STATUS_BADGE_BLUE_HOVER_FIXTURE_TEST_ID
      );
    }
  });

  it('rejects the clipping/nowrap fixture', () => {
    expect(
      codesOf(
        auditStatusBadgeSource(STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_SOURCE)
      )
    ).toEqual(['clipping-nowrap']);

    render(<StatusBadgeClippingNowrapDriftFixture />);
    const fixture = screen.getByTestId(
      STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture).toHaveClass(
      'overflow-hidden',
      'truncate',
      'whitespace-normal'
    );
    for (const sourcePath of productionSourcePaths) {
      expect(readSource(sourcePath)).not.toContain(
        STATUS_BADGE_CLIPPING_NOWRAP_FIXTURE_TEST_ID
      );
    }
  });

  it('rejects the noncanonical geometry fixture', () => {
    expect(
      codesOf(
        auditStatusBadgeSource(STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_SOURCE)
      )
    ).toEqual(['geometry-shift']);

    render(<StatusBadgeGeometryShiftDriftFixture />);
    const fixture = screen.getByTestId(
      STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID
    );
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(fixture.className).toMatch(/\bp-4\b/);
    expect(fixture.className).toMatch(/\bmin-h-10\b/);
    for (const sourcePath of productionSourcePaths) {
      expect(readSource(sourcePath)).not.toContain(
        STATUS_BADGE_GEOMETRY_SHIFT_FIXTURE_TEST_ID
      );
    }
    expect(readSource(fixtureSourcePath)).toContain('data-deliberate-red');
  });
});
