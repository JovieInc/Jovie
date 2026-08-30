import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';
import CookiesLegalLoading from './cookies/loading';
import LegalLoading from './loading';
import PrivacyLegalLoading from './privacy/loading';
import TermsLegalLoading from './terms/loading';

const FAMILY_SOURCES = [
  'app/(dynamic)/legal/loading.tsx',
  'app/(dynamic)/legal/cookies/loading.tsx',
  'app/(dynamic)/legal/privacy/loading.tsx',
  'app/(dynamic)/legal/terms/loading.tsx',
] as const;

const EXPECTED_SKELETON_SIGNATURES = [
  'h-10 w-56',
  'mt-3 h-4 w-44',
  'h-4 w-full max-w-xl',
  'mt-2 h-4 w-4/5 max-w-lg',
  'h-9 w-44',
  'h-4 w-24',
  'h-4 w-48',
  'h-4 w-40',
  'h-4 w-24',
  'h-4 w-44',
  'h-4 w-36',
  'h-4 w-40',
  ...Array.from({ length: 5 }, () => [
    'h-7 w-52',
    'h-4 w-full',
    'h-4 w-11/12',
    'h-4 w-4/5',
  ]).flat(),
] as const;

const SKELETON_GEOMETRY_TOKENS = [
  'mt-3',
  'mt-2',
  'h-10',
  'h-9',
  'h-7',
  'h-4',
  'w-56',
  'w-52',
  'w-48',
  'w-44',
  'w-40',
  'w-36',
  'w-24',
  'w-full',
  'w-11/12',
  'w-4/5',
  'max-w-xl',
  'max-w-lg',
] as const;

function skeletonSignature(element: Element): string {
  return SKELETON_GEOMETRY_TOKENS.filter(token =>
    element.classList.contains(token)
  ).join(' ');
}

describe('LegalLoading', () => {
  it('exposes exactly one polite busy loading owner', () => {
    const { container } = render(<LegalLoading />);
    const owner = screen.getByRole('status', {
      name: 'Loading Legal Document',
    });

    expect(owner).toHaveAttribute('aria-busy', 'true');
    expect(owner).toHaveAttribute('aria-live', 'polite');
    expect(owner).toHaveAttribute('data-testid', 'legal-loading');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
  });

  it('composes canonical Skeleton placeholders at the existing geometry', () => {
    const { container } = render(<LegalLoading />);
    const skeletons = Array.from(container.querySelectorAll('.skeleton'));

    expect(skeletons).toHaveLength(EXPECTED_SKELETON_SIGNATURES.length);
    expect(skeletons.map(skeletonSignature)).toEqual([
      ...EXPECTED_SKELETON_SIGNATURES,
    ]);

    for (const skeleton of skeletons) {
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).toHaveAttribute('data-state', 'shimmer');
      expect(skeleton.className).toContain('motion-reduce:animate-none');
    }

    expect(container.querySelector('.lg\\:hidden')).toHaveClass(
      'border-y',
      'border-neutral-200',
      'py-5',
      'dark:border-white/10'
    );
    expect(
      container.querySelector(
        '.lg\\:grid-cols-\\[220px_minmax\\(0\\,760px\\)\\]'
      )
    ).not.toBeNull();
  });

  it('keeps privacy, terms, and cookies loading on the shared route', () => {
    expect(PrivacyLegalLoading).toBe(LegalLoading);
    expect(TermsLegalLoading).toBe(LegalLoading);
    expect(CookiesLegalLoading).toBe(LegalLoading);
  });

  it('does not keep a raw route-local skeleton implementation', () => {
    const webRoot = resolve(__dirname, '../../..');

    for (const sourcePath of FAMILY_SOURCES) {
      const source = readFileSync(resolve(webRoot, sourcePath), 'utf8');
      expect(source, sourcePath).not.toMatch(
        /className=['"][^'"]*\bskeleton\b/
      );
    }

    expect(readFileSync(resolve(webRoot, FAMILY_SOURCES[0]), 'utf8')).toContain(
      "from '@jovie/ui'"
    );
  });
});
