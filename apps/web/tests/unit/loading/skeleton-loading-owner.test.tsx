import { LoadingSkeleton } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';
import {
  CanonicalLoadingFixture,
  DuplicateLoadingOwnerFixture,
  MissingLoadingNameFixture,
  MissingPoliteLiveFixture,
  RawSkeletonLoadingFixture,
  SKELETON_LOADING_RED_FIXTURE_TEST_ID,
  SpoofedCanonicalLoadingFixture,
} from './skeleton-loading-fixtures';

describe('canonical Skeleton loading owner contract', () => {
  it('exposes one named owner with decorative canonical children', () => {
    const { container } = render(<LoadingSkeleton label='Loading audience' />);

    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
    expect(
      screen.getByRole('status', { name: 'Loading audience' })
    ).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      1
    );
  });

  it('keeps the canonical owner isolated from decorative siblings', () => {
    const { container } = render(
      <CanonicalLoadingFixture>
        <span aria-hidden='true'>Decorative content</span>
      </CanonicalLoadingFixture>
    );

    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
  });

  it('rejects the raw-skeleton deliberate-red fixture', () => {
    const { container } = render(<RawSkeletonLoadingFixture />);
    const fixture = screen.getByTestId(SKELETON_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture).toHaveAttribute('data-red-kind', 'raw-skeleton');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'missing-owner',
      'raw-skeleton',
    ]);
  });

  it('rejects raw markup that spoofs the old canonical attributes', () => {
    const { container } = render(<SpoofedCanonicalLoadingFixture />);
    const fixture = screen.getByTestId(SKELETON_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute(
      'data-red-kind',
      'spoofed-canonical-skeleton'
    );
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'missing-owner',
      'raw-skeleton',
    ]);
  });

  it('rejects the duplicate-owner deliberate-red fixture', () => {
    const { container } = render(<DuplicateLoadingOwnerFixture />);
    const fixture = screen.getByTestId(SKELETON_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-red-kind', 'duplicate-owners');
    expect(inspectLoadingOwners(container).owners).toHaveLength(2);
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'duplicate-owners',
      'competing-descendant',
    ]);
  });

  it('rejects the missing-name deliberate-red fixture', () => {
    const { container } = render(<MissingLoadingNameFixture />);
    const fixture = screen.getByTestId(SKELETON_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-red-kind', 'missing-name');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'missing-accessible-name',
    ]);
  });

  it('rejects the missing-live-region deliberate-red fixture', () => {
    const { container } = render(<MissingPoliteLiveFixture />);
    const fixture = screen.getByTestId(SKELETON_LOADING_RED_FIXTURE_TEST_ID);

    expect(fixture).toHaveAttribute('data-red-kind', 'missing-polite-live');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([
      'missing-polite-live',
    ]);
  });
});
