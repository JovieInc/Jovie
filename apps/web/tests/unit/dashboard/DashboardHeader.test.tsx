import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';

describe('DashboardHeader', () => {
  it('renders mobile actions in a flat wrapper without pill chrome', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Releases', href: '/app/dashboard/releases' }]}
        action={<button type='button'>Add release</button>}
      />
    );

    const mobileHeader = container.querySelector('.hidden.max-sm\\:flex');
    const actionButton = within(mobileHeader!).getByRole('button', {
      name: 'Add release',
    });
    const actionWrapper = actionButton.parentElement;

    expect(actionButton).toBeInTheDocument();
    expect(actionWrapper).not.toHaveClass(
      'rounded-full',
      'border',
      'bg-(--linear-app-content-surface)',
      'p-1'
    );
    expect(actionWrapper).toHaveClass('flex', 'items-center', 'gap-1');
  });
});
