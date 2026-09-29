import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminAssetRow } from '@/lib/admin/types';
import { AdminAssetsPageWrapper } from './AdminAssetsPageWrapper';

const { mockSetHeaderActions } = vi.hoisted(() => ({
  mockSetHeaderActions: vi.fn(),
}));

vi.mock('@/contexts/HeaderActionsContext', () => ({
  useSetHeaderActions: () => ({ setHeaderActions: mockSetHeaderActions }),
}));

vi.mock('./AdminAssetsTable', () => ({
  AdminAssetsTable: (props: { readonly assets: AdminAssetRow[] }) => (
    <div data-testid='admin-assets-table'>{props.assets.length}</div>
  ),
}));

const props = {
  assets: [],
  pageSize: 20,
  total: 0,
  search: '',
  sort: 'created_desc' as const,
  type: 'all' as const,
  issues: 'all' as const,
  verified: 'all' as const,
};

describe('AdminAssetsPageWrapper', () => {
  it('registers the drawer toggle and renders the table', () => {
    render(<AdminAssetsPageWrapper {...props} />);
    expect(screen.getByTestId('admin-assets-table')).toBeInTheDocument();
    expect(mockSetHeaderActions).toHaveBeenCalled();
  });
});
