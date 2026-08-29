import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableBadge } from '@/components/organisms/table';

describe('TableBadge', () => {
  it('defaults to small size for table density consistency', () => {
    render(<TableBadge variant='secondary'>Active</TableBadge>);

    const badge = screen.getByText('Active');

    expect(badge.className).toContain('text-3xs');
    expect(badge.className).not.toContain('text-[10px]');
  });
});
