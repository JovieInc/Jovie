import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type CatalogBrowserCluster,
  type CatalogBrowserRow,
  CatalogTaskBuilderDialog,
} from './CatalogTaskBuilderDialog';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/components/feedback', () => ({ toast: toastMocks }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const clusters: CatalogBrowserCluster[] = [
  { id: 1, slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
];

const catalog: CatalogBrowserRow[] = [
  {
    slug: 'spotify-editorial-pitch',
    name: 'Pitch Spotify editorial',
    shortDescription: 'Submit via Spotify for Artists.',
    clusterId: 1,
    category: 'editorial',
  },
  {
    slug: 'backup-masters',
    name: 'Back up the masters',
    shortDescription: null,
    clusterId: null,
    category: 'ops',
  },
];

function renderDialog(
  overrides: Partial<Parameters<typeof CatalogTaskBuilderDialog>[0]> = {}
) {
  const props = {
    open: true,
    releaseId: 'release-1',
    catalog,
    clusters,
    alreadyAddedSlugs: [] as string[],
    onClose: vi.fn(),
    onAdded: vi.fn(),
    addAction: vi.fn(async () => undefined),
    ...overrides,
  };
  const view = render(<CatalogTaskBuilderDialog {...props} />);
  return { ...view, props };
}

describe('CatalogTaskBuilderDialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('groups rows under sentence-case headings and stays axe-clean', async () => {
    renderDialog();

    const heading = screen.getByText('Editorial Pitching');
    expect(heading).not.toHaveClass('uppercase');
    expect(screen.getByText('Uncategorized')).toBeVisible();
    expect(screen.getByTestId('catalog-row-backup-masters')).toHaveTextContent(
      'Back up the masters'
    );
    await expectNoA11yViolations(document.body);
  });

  it('keeps typed search text and focus across a parent rerender', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderDialog();

    const search = screen.getByRole('searchbox', { name: 'Search Tasks' });
    await user.type(search, 'spotify');
    expect(search).toHaveValue('spotify');
    expect(search).toHaveFocus();

    rerender(
      <CatalogTaskBuilderDialog {...props} alreadyAddedSlugs={['x-other']} />
    );
    expect(screen.getByRole('searchbox', { name: 'Search Tasks' })).toHaveValue(
      'spotify'
    );
    expect(
      screen.getByRole('searchbox', { name: 'Search Tasks' })
    ).toHaveFocus();
    expect(screen.queryByText('Back up the masters')).not.toBeInTheDocument();
  });

  it('shows the empty message when nothing matches', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search Tasks' }),
      'no such task'
    );
    expect(
      screen.getByText('No catalog tasks match that search.')
    ).toBeVisible();
    await expectNoA11yViolations(document.body);
  });

  it('adds a task, marks it added and reports success', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByTestId('catalog-add-spotify-editorial-pitch'));
    expect(props.addAction).toHaveBeenCalledWith(
      'release-1',
      'spotify-editorial-pitch'
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('catalog-add-spotify-editorial-pitch')
      ).toHaveTextContent('Added')
    );
    expect(
      screen.getByTestId('catalog-add-spotify-editorial-pitch')
    ).toBeDisabled();
    expect(props.onAdded).toHaveBeenCalledTimes(1);
    expect(toastMocks.success).toHaveBeenCalledWith('Task added from catalog.');
  });

  it('reports a failed add and leaves the row addable', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({
      addAction: vi.fn(async () => {
        throw new Error('network');
      }),
    });

    await user.click(screen.getByTestId('catalog-add-backup-masters'));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Could not add that task. Try again.'
      )
    );
    expect(screen.getByTestId('catalog-add-backup-masters')).toHaveTextContent(
      'Add'
    );
    expect(screen.getByTestId('catalog-add-backup-masters')).toBeEnabled();
    expect(props.onAdded).not.toHaveBeenCalled();
  });

  it('closes from the Done action', async () => {
    const user = userEvent.setup();
    const { props } = renderDialog({ alreadyAddedSlugs: ['backup-masters'] });

    expect(screen.getByTestId('catalog-add-backup-masters')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
