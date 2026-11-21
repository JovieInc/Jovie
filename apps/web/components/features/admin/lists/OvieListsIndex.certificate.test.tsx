import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  query: {} as Record<string, unknown>,
}));

vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  useOvieSidebarListsQuery: () => mocks.query,
}));

import { OvieListsIndex } from './OvieListsIndex';

describe('OvieListsIndex certificate', () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.query = { data: undefined, isError: false, refetch: mocks.refetch };
  });

  it('is axe-clean while loading', async () => {
    const { container } = render(<OvieListsIndex />);
    await expectNoA11yViolations(container);
  });

  it('is axe-clean with lists and smart views', async () => {
    mocks.query.data = {
      lists: [{ id: 'press', name: 'Press', count: 5, pendingSuggestions: 0 }],
      smartViews: [{ id: 'favorites', name: 'Favorites', count: 4 }],
    };
    const { container } = render(<OvieListsIndex />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('is axe-clean when empty', async () => {
    mocks.query.data = { lists: [], smartViews: [] };
    const { container } = render(<OvieListsIndex />);
    expect(screen.getByText('No lists yet')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('retries from the error state and stays axe-clean', async () => {
    mocks.query.isError = true;
    const { container } = render(<OvieListsIndex />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
