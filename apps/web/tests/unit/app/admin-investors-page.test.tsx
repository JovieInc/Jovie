import { render, screen } from '@testing-library/react';
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), auth: vi.fn() }));
vi.mock('@/app/app/(shell)/admin/investors/investors-data', () => ({
  loadAdminInvestorPipelineData: mocks.load,
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.auth,
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/app/app/(shell)/admin/investors/TokenCopyButton', () => ({
  TokenCopyButton: ({ token }: { token: string }) => <span>{token}</span>,
}));

import InvestorPipelinePage from '@/app/app/(shell)/admin/investors/page';

// Resolve async server nodes before DOM rendering; this tests composition,
// not RSC streaming.
async function resolveServerNodes(node: ReactNode): Promise<ReactNode> {
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (
    typeof node.type === 'function' &&
    node.type.constructor.name === 'AsyncFunction'
  ) {
    const server = node.type as (props: unknown) => Promise<ReactNode>;
    return resolveServerNodes(await server(node.props));
  }
  if (!node.props.children) return node;
  const children = await Promise.all(
    Children.toArray(node.props.children).map(resolveServerNodes)
  );
  return cloneElement(node, undefined, ...children);
}

const link = {
  id: 'link-1',
  token: 'tok_123',
  label: 'Seed round',
  investorName: 'Ada Capital',
  email: null,
  stage: 'engaged',
  engagementScore: 42,
  isActive: true,
  notes: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  viewCount: 3,
  lastViewed: null,
};

describe('admin investor pipeline page', () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue(undefined);
    mocks.load.mockReset();
  });

  it('shows each investor on the shared person row with a face', async () => {
    mocks.load.mockResolvedValue([link]);
    render(await resolveServerNodes(await InvestorPipelinePage()));

    const person = screen
      .getByText('Ada Capital')
      .closest('[data-table-person-cell]');
    expect(person).not.toBeNull();
    expect(person).toHaveTextContent('AC');
  });

  it('names unnamed investors on the person row', async () => {
    mocks.load.mockResolvedValue([{ ...link, investorName: null }]);
    render(await resolveServerNodes(await InvestorPipelinePage()));

    expect(
      screen.getByText('Unknown investor').closest('[data-table-person-cell]')
    ).not.toBeNull();
  });

  it('loads on the same two-line row mode the loaded rows use', async () => {
    const page = (await InvestorPipelinePage()) as ReactElement<{
      children: ReactElement<{ fallback: ReactNode }>;
    }>;
    const { container } = render(page.props.children.props.fallback);

    expect(
      container.querySelector('[data-table-row-mode="two-line"]')
    ).not.toBeNull();
  });
});
