import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <button type='button' className={className} {...props}>
      {children}
    </button>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <div />,
  TooltipShortcut: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { AudienceFilterDropdown } from '@/components/dashboard/organisms/dashboard-audience-table/AudienceFilterDropdown';

describe('AudienceFilterDropdown styling', () => {
  it('applies keyboard-visible ring offset styles on filter trigger', () => {
    render(
      <AudienceFilterDropdown
        filters={{ segments: [] }}
        onFiltersChange={() => {}}
      />
    );

    const button = screen.getByRole('button', { name: /filter/i });
    expect(button.className).toContain('focus-visible:ring-offset-2');
    expect(button.className).toContain('focus-visible:ring-2');
  });
});
