import { useMutation, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('@/components/feedback', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/components/feedback')>();
  return {
    ...original,
    toast: Object.assign(vi.fn(), {
      ...original.toast,
      error: mocks.toastError,
    }),
  };
});

import {
  QueryProvider,
  resetBrowserQueryClientForTests,
} from './QueryProvider';

function ReleasesQuery() {
  const query = useQuery({
    queryKey: ['certificate', 'releases'],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      return ['Neon Circuit', 'After Hours'];
    },
  });
  if (query.isPending) return <p>Loading releases</p>;
  return (
    <ul aria-label='Releases'>
      {query.data?.map(title => (
        <li key={title}>{title}</li>
      ))}
    </ul>
  );
}

function FailingQuery() {
  const query = useQuery({
    queryKey: ['certificate', 'failing'],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      throw new Error('Releases are unavailable');
    },
    retry: false,
  });
  if (query.isError) return <p role='alert'>{query.error.message}</p>;
  return <p>Loading releases</p>;
}

function SaveButton({ withOwnHandler }: { readonly withOwnHandler: boolean }) {
  const onOwnError = vi.fn();
  const mutation = useMutation({
    mutationFn: async () => {
      throw new Error('Save failed');
    },
    ...(withOwnHandler ? { onError: onOwnError } : {}),
  });
  return (
    <button type='button' onClick={() => mutation.mutate()}>
      Save
    </button>
  );
}

describe('QueryProvider certificate', () => {
  beforeEach(() => {
    resetBrowserQueryClientForTests();
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    resetBrowserQueryClientForTests();
  });

  it('serves query data to its children and stays axe-clean', async () => {
    const { container } = render(
      <QueryProvider>
        <ReleasesQuery />
      </QueryProvider>
    );

    expect(
      await screen.findByRole('list', { name: 'Releases' })
    ).toHaveTextContent('Neon Circuit');
    await expectNoA11yViolations(container);
  });

  it('surfaces a failed query to the child that owns it', async () => {
    const { container } = render(
      <QueryProvider>
        <FailingQuery />
      </QueryProvider>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Releases are unavailable'
    );
    await expectNoA11yViolations(container);
  });

  it('shows the canonical error toast only for mutations without their own onError', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <QueryProvider>
        <SaveButton withOwnHandler={false} />
      </QueryProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    await expectNoA11yViolations(container);
    unmount();

    render(
      <QueryProvider>
        <main dir='rtl' lang='ar'>
          <SaveButton withOwnHandler />
        </main>
      </QueryProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });
});
