import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_WORKSPACE_TABS } from '@/constants/admin-navigation';
import { OperatorRouteTabs } from './OperatorRouteTabs';

const pathnameMock = vi.hoisted(() => vi.fn(() => '/app/ov/shipping'));
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock() }));

describe('OperatorRouteTabs', () => {
  beforeEach(() => pathnameMock.mockReturnValue('/app/ov/shipping'));

  it('links every Shipping view and marks only the current one', () => {
    pathnameMock.mockReturnValue('/app/ov/product');
    render(
      <OperatorRouteTabs
        tabs={ADMIN_WORKSPACE_TABS.shipping}
        label='Shipping Views'
      />
    );
    const nav = screen.getByRole('navigation', { name: 'Shipping Views' });
    const links = nav.querySelectorAll('a');
    expect([...links].map(link => link.getAttribute('href'))).toEqual(
      ADMIN_WORKSPACE_TABS.shipping.map(tab => tab.href)
    );
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: 'Customer Reality' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the first tab current on its own route', () => {
    render(
      <OperatorRouteTabs
        tabs={ADMIN_WORKSPACE_TABS.operations}
        label='Fleet Views'
      />
    );
    expect(screen.getByRole('link', { name: 'Health' })).not.toHaveAttribute(
      'aria-current'
    );
    pathnameMock.mockReturnValue('/app/ov/operations');
    render(
      <OperatorRouteTabs
        tabs={ADMIN_WORKSPACE_TABS.operations}
        label='Fleet Views'
      />
    );
    expect(
      screen.getAllByRole('link', { name: 'Health' }).at(-1)
    ).toHaveAttribute('aria-current', 'page');
  });
});
