import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminTableShell } from './AdminTableShell';

describe('AdminTableShell', () => {
  it('passes a zero sticky offset to the body', () => {
    render(
      <AdminTableShell>
        {({ stickyTopPx }) => <p>top {stickyTopPx}</p>}
      </AdminTableShell>
    );
    expect(screen.getByText('top 0')).toBeInTheDocument();
  });
});
