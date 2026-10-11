import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({
    size: _size,
    ...props
  }: ComponentProps<'button'> & { size?: string }) => <button {...props} />,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    ...props
  }: ComponentProps<'button'> & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <button
      {...props}
      role='switch'
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));
vi.mock('@/components/molecules/ContentSectionHeader', () => ({
  ContentSectionHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: string;
    subtitle: string;
    actions?: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {actions}
    </section>
  ),
}));
vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/components/organisms/table', () => ({
  TableEmptyState: () => null,
}));
vi.mock('@/features/admin/table/AdminDataTable', () => ({
  AdminDataTable: () => null,
}));
vi.mock('@/features/admin/table/AdminTablePagination', () => ({
  AdminTablePagination: () => null,
}));

import { EmailQueuePanel } from '@/components/features/admin/outreach/EmailQueuePanel';

describe('EmailQueuePanel closed audience policy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the policy and disables delivery even with enabled campaigns and pending leads', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith('/settings')
          ? { campaignsEnabled: true }
          : { items: [], total: 0, pendingTotal: 1, page: 1, limit: 50 },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<EmailQueuePanel />);
    await waitFor(() =>
      expect(screen.getByText('1 pending')).toBeInTheDocument()
    );

    const queue = screen.getByRole('button', { name: 'Queue Next Batch' });
    const campaigns = screen.getByRole('switch', {
      name: 'Toggle Campaign Emails',
    });
    expect(queue).toBeDisabled();
    expect(campaigns).toBeDisabled();
    expect(campaigns).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('spinbutton', { name: 'Queue Outreach Count' })
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Audience delivery is disabled. Draft review remains available.'
      )
    ).toBeInTheDocument();
    fireEvent.click(queue);
    fireEvent.click(campaigns);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(call => call.length === 1)).toBe(true);
  });
});
