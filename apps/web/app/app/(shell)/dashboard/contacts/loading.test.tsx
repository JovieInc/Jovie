import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  inspectLoadingOwners,
  loadingOwnerIssueCodes,
} from '@/tests/utils/loading-owner';
import ContactsLoading from './loading';

describe('ContactsLoading', () => {
  it('composes every placeholder under one named polite loading owner', () => {
    const { container } = render(<ContactsLoading />);

    expect(
      screen.getByRole('status', { name: 'Loading Contacts' })
    ).toHaveAttribute('aria-live', 'polite');
    expect(loadingOwnerIssueCodes(inspectLoadingOwners(container))).toEqual([]);
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThan(20);
  });
});
