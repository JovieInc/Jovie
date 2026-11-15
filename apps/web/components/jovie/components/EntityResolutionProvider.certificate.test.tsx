import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  EntityResolutionProvider,
  useEntityResolution,
} from './EntityResolutionProvider';

function Chip({ kind = 'release', id = 'rel_1' }) {
  const { ref, isLoading } = useEntityResolution(
    kind as 'release' | 'profile',
    id
  );
  return (
    <p data-loading={String(isLoading)}>
      {ref ? `Resolved: ${ref.label}` : 'Label only'}
    </p>
  );
}

function release(title: string): ReleaseViewModel {
  return {
    id: 'rel_1',
    profileId: 'p1',
    title,
    artworkUrl: undefined,
    status: 'released',
    releaseType: 'single',
  } as unknown as ReleaseViewModel;
}

function renderWith(client: QueryClient | null, children = <Chip />) {
  const tree = (
    <EntityResolutionProvider profileId='p1' ownProfileLabel='Tim White'>
      <main>{children}</main>
    </EntityResolutionProvider>
  );
  return render(
    client ? (
      <QueryClientProvider client={client}>{tree}</QueryClientProvider>
    ) : (
      tree
    )
  );
}

describe('EntityResolutionProvider certificate', () => {
  it('leaves chips label-only while the matrix is empty, then resolves on fill', async () => {
    const client = new QueryClient();
    const { container } = renderWith(client);

    expect(screen.getByText('Label only')).toHaveAttribute(
      'data-loading',
      'false'
    );
    await expectNoA11yViolations(container);

    await act(async () => {
      client.setQueryData(queryKeys.releases.matrix('p1'), [
        release('Midnight Drive'),
      ]);
    });

    expect(await screen.findByText('Resolved: Midnight Drive')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('withholds a cached title after a failed read', async () => {
    const client = new QueryClient();
    const key = queryKeys.releases.matrix('p1');
    client.setQueryData(key, [release('Private title')]);
    const { container } = renderWith(client);
    expect(screen.getByText('Resolved: Private title')).toBeVisible();

    await act(async () => {
      client
        .getQueryCache()
        .find({ queryKey: key })
        ?.setState({ status: 'error', error: new Error('Access revoked') });
    });

    expect(await screen.findByText('Label only')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('resolves the own profile with no QueryClient and keeps RTL titles', async () => {
    const { container, unmount } = renderWith(
      null,
      <Chip kind='profile' id='p1' />
    );
    expect(screen.getByText('Resolved: Tim White')).toBeVisible();
    await expectNoA11yViolations(container);
    unmount();

    const client = new QueryClient();
    client.setQueryData(queryKeys.releases.matrix('p1'), [
      release('قيادة منتصف الليل'),
    ]);
    const rtl = renderWith(
      client,
      <div dir='rtl' lang='ar'>
        <Chip />
      </div>
    );
    expect(screen.getByText('Resolved: قيادة منتصف الليل')).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
