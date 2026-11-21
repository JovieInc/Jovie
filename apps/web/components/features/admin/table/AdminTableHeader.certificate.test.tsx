import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminTableHeader, AdminTableSubheader } from './AdminTableHeader';

describe('AdminTableHeader certificate', () => {
  it('renders the title and subtitle', async () => {
    const { container } = render(
      <AdminTableHeader title='Creators' subtitle='1,204 profiles' />
    );
    expect(screen.getByText('Creators')).toBeInTheDocument();
    expect(screen.getByText('1,204 profiles')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders action content next to the title', async () => {
    const { container } = render(
      <AdminTableHeader
        title='Creators'
        subtitle='1,204 profiles'
        actions={<a href='/admin/ingest'>Ingest profile</a>}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Ingest profile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders subheader children and a toolbar start slot', async () => {
    const { container, rerender } = render(
      <AdminTableSubheader>Plain child</AdminTableSubheader>
    );
    expect(screen.getByText('Plain child')).toBeInTheDocument();
    rerender(<AdminTableSubheader start={<span>Filters</span>} />);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('marks the subheader inert and hidden while a bulk action owns it', async () => {
    const { container } = render(
      <AdminTableSubheader inert start={<span>Filters</span>} />
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });
});
