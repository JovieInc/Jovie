import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { ShellPageTitle } from './ShellPageTitle';

function BadgeProbe() {
  const { headerBadge } = useHeaderActions();
  return <div data-testid='badge-probe'>{headerBadge}</div>;
}

describe('ShellPageTitle', () => {
  it('sets the shell breadcrumb title while mounted', () => {
    render(
      <HeaderActionsProvider>
        <ShellPageTitle title='Certifications' />
        <BadgeProbe />
      </HeaderActionsProvider>
    );

    expect(screen.getByTestId('badge-probe')).toHaveTextContent(
      'Certifications'
    );
  });

  it('clears the breadcrumb title on unmount', () => {
    const { unmount } = render(
      <HeaderActionsProvider>
        <ShellPageTitle title='Certifications' />
        <BadgeProbe />
      </HeaderActionsProvider>
    );

    unmount();
    expect(screen.queryByText('Certifications')).toBeNull();
  });
});
