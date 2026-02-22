import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClientProviders } from '@/components/providers/ClientProviders';

function QueryProbe() {
  const queryClient = useQueryClient();

  return (
    <div data-testid='query-probe'>{queryClient ? 'ready' : 'missing'}</div>
  );
}

describe('ClientProviders', () => {
  it('provides QueryClient even when skipCoreProviders is true', () => {
    render(
      <ClientProviders publishableKey={undefined} skipCoreProviders>
        <QueryProbe />
      </ClientProviders>
    );

    expect(screen.getByTestId('query-probe')).toHaveTextContent('ready');
  });
});
