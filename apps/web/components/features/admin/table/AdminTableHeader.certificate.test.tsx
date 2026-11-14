import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminTableHeader, AdminTableSubheader } from './AdminTableHeader';

const LONG_TITLE =
  'Creators claimed through the spring partner programme and the label showcase follow-up';
const LONG_SUBTITLE =
  '1,204 profiles claimed this month across every acquisition channel, including the partner programme, organic search and direct outreach.';

describe('AdminTableHeader certificate states', () => {
  it('shows the title and subtitle with no actions', async () => {
    const { container } = render(
      <AdminTableHeader title='Creators' subtitle='1,204 profiles claimed' />
    );
    expect(screen.getByText('Creators')).toBeInTheDocument();
    expect(screen.getByText('1,204 profiles claimed')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders caller actions that stay clickable beside long copy', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const { container } = render(
      <AdminTableHeader
        title={LONG_TITLE}
        subtitle={LONG_SUBTITLE}
        className='custom-header'
        actions={
          <button type='button' onClick={onExport}>
            Export
          </button>
        }
      />
    );
    expect(screen.getByText(LONG_TITLE)).toBeInTheDocument();
    expect(screen.getByText(LONG_SUBTITLE)).toBeInTheDocument();
    expect(container.querySelector('.custom-header')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AdminTableHeader
          title='المبدعون'
          subtitle='تمت المطالبة بـ 1,204 ملفًا هذا الشهر'
        />
      </div>
    );
    expect(screen.getByText('المبدعون')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('AdminTableSubheader certificate states', () => {
  it('lays out a start-only toolbar and keeps it axe clean', async () => {
    const { container } = render(
      <AdminTableSubheader start={<span>20 profiles</span>} />
    );
    expect(screen.getByText('20 profiles')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-transparent');
    expect(container.firstChild).not.toHaveClass('border-b');
    await expectNoA11yViolations(container);
  });

  it('hides a covered toolbar from assistive tech', async () => {
    const { container } = render(
      <AdminTableSubheader
        inert
        className='custom-subheader'
        start='20 profiles'
        end={<button type='button'>Export</button>}
      />
    );
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveClass('custom-subheader');
    await expectNoA11yViolations(container);
  });
});
