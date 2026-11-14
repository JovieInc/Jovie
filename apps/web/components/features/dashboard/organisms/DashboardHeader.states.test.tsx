import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardHeader } from './DashboardHeader';

describe('DashboardHeader states', () => {
  it('renders the trail without any optional slot', async () => {
    const { container } = render(
      <main>
        <DashboardHeader
          breadcrumbs={[
            { label: 'Jovie', href: '/app' },
            { label: 'Releases', href: '/app/releases' },
          ]}
        />
      </main>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Releases'
    );
    expect(screen.getByText('Jovie')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long title whole in the truncating heading', async () => {
    const title =
      'Plan the full European summer festival run including travel, merch restocks and every press interview request';
    const { container } = render(
      <main>
        <DashboardHeader
          breadcrumbs={[{ label: 'Jovie' }, { label: title }]}
          action={<button type='button'>Share</button>}
        />
      </main>
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(title);
    expect(heading).toHaveClass('truncate', 'min-w-0');
    await expectNoA11yViolations(container);
  });

  it('renders a right-to-left trail accessibly', async () => {
    const { container } = render(
      <main dir='rtl' lang='ar'>
        <DashboardHeader
          breadcrumbs={[
            { label: 'جوفي' },
            { label: 'خطة جولة المهرجانات الصيفية في أوروبا' },
          ]}
          action={<button type='button'>مشاركة</button>}
        />
      </main>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'خطة جولة المهرجانات الصيفية في أوروبا'
    );
    await expectNoA11yViolations(container);
  });
});
