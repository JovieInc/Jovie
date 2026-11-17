'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ProfilesWorkspaceData } from '@/components/features/presence/types';
import { data, principal, row, scope } from './presence-removal-test-fixtures';
import { usePresenceRemoval } from './usePresenceRemoval';

export function Harness({
  value = data,
  selection = row.id,
  prepare,
  binding = principal,
}: {
  readonly value?: ProfilesWorkspaceData;
  readonly selection?: string | null;
  readonly prepare?: (selection: null) => void;
  readonly binding?: typeof principal;
}) {
  const removal = usePresenceRemoval(value, scope, selection, prepare, binding);
  return (
    <>
      <button type='button' onClick={() => removal.request(row)}>
        Remove saved link
      </button>
      {removal.dialog}
    </>
  );
}
export function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: 3 } },
  });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<Harness />, { wrapper }) };
}
