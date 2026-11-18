import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('nuqs/adapters/next/app', () => ({
  NuqsAdapter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='nuqs-adapter'>{children}</div>
  ),
}));

import { DemoClientProviders } from './DemoClientProviders';

function QueryDefaults() {
  const options = useQueryClient().getDefaultOptions().queries;
  return (
    <dl>
      <dt>retry</dt>
      <dd>{String(options?.retry)}</dd>
      <dt>refetchOnMount</dt>
      <dd>{String(options?.refetchOnMount)}</dd>
      <dt>staleTime</dt>
      <dd>{String(options?.staleTime)}</dd>
    </dl>
  );
}

describe('DemoClientProviders certificate', () => {
  it('gives children a frozen query client inside the URL-state adapter', async () => {
    const { container } = render(
      <DemoClientProviders>
        <QueryDefaults />
      </DemoClientProviders>
    );

    expect(screen.getByTestId('nuqs-adapter')).toBeInTheDocument();
    expect(screen.getByText('retry').nextSibling).toHaveTextContent('false');
    expect(screen.getByText('refetchOnMount').nextSibling).toHaveTextContent(
      'false'
    );
    expect(screen.getByText('staleTime').nextSibling).toHaveTextContent(
      'Infinity'
    );
    await expectNoA11yViolations(container);
  });

  it('provides tooltips that open from the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DemoClientProviders>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type='button'>Info</button>
          </TooltipTrigger>
          <TooltipContent>Demo data only</TooltipContent>
        </Tooltip>
      </DemoClientProviders>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Info' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Demo data only'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left content whole', async () => {
    const long =
      'The demo runs without an account and every screen reads the same frozen fixtures.';
    const { container } = render(
      <DemoClientProviders>
        <p dir='rtl'>{long}</p>
      </DemoClientProviders>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
