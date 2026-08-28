import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LegalLoading from '@/app/(dynamic)/legal/loading';
import { AuthLoader } from '@/components/organisms/AuthLoader';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';
import {
  AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID,
  DuplicateLoadingOwnersFixture,
  MissingLoadingOwnerFixture,
  RawSkeletonLoadingFixture,
} from './auth-legal-loading-fixtures';

const PRODUCTION_SOURCES = [
  'components/organisms/AuthLoader.tsx',
  'app/(dynamic)/legal/loading.tsx',
] as const;

const FAMILY_SOURCES = [
  ...PRODUCTION_SOURCES,
  'app/(dynamic)/legal/cookies/loading.tsx',
  'app/(dynamic)/legal/privacy/loading.tsx',
  'app/(dynamic)/legal/terms/loading.tsx',
] as const;

const webRoot = resolve(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('AuthLoader and legal loading owner contract', () => {
  it('keeps one owner on AuthLoader and legal loading', () => {
    const auth = render(<AuthLoader />);
    const legal = render(<LegalLoading />);

    expect(
      loadingOwnerIssueCodes(inspectLoadingOwners(auth.container))
    ).toEqual([]);
    expect(
      loadingOwnerIssueCodes(inspectLoadingOwners(legal.container))
    ).toEqual([]);
    expect(auth.getByRole('status', { name: 'Loading' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(
      legal.getByRole('status', { name: 'Loading Legal Document' })
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('rejects the missing-owner deliberate-red fixture', () => {
    const { container } = render(<MissingLoadingOwnerFixture />);
    const fixture = screen.getByTestId(AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.getAttribute('style') ?? '').toContain('#ff0000');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'missing-owner',
      'raw-skeleton',
    ]);
  });

  it('rejects the duplicate-owner deliberate-red fixture', () => {
    const { container } = render(<DuplicateLoadingOwnersFixture />);
    const fixture = screen.getByTestId(AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-red-kind', 'duplicate-owners');
    expect(inspectLoadingOwners(container).owners).toHaveLength(2);
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'duplicate-owners',
    ]);
  });

  it('rejects the raw-skeleton deliberate-red fixture', () => {
    const { container } = render(<RawSkeletonLoadingFixture />);
    const fixture = screen.getByTestId(AUTH_LEGAL_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-red-kind', 'raw-skeleton');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'raw-skeleton',
    ]);
  });

  it('keeps production sources off the deliberate-red fixtures', () => {
    for (const sourcePath of FAMILY_SOURCES) {
      const source = readSource(sourcePath);
      expect(source, sourcePath).not.toContain('auth-legal-loading-fixtures');
      expect(source, sourcePath).not.toContain('data-deliberate-red');
      expect(source, sourcePath).not.toMatch(
        /className=['"][^'"]*\bskeleton\b/
      );
    }

    expect(readSource(PRODUCTION_SOURCES[0])).toContain("role='status'");
    expect(readSource(PRODUCTION_SOURCES[1])).toContain("from '@jovie/ui'");
    expect(readSource(PRODUCTION_SOURCES[1])).toContain('<Skeleton');
  });
});
