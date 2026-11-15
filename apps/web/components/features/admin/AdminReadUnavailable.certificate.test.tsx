import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminReadUnavailable } from './AdminReadUnavailable';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('AdminReadUnavailable certificate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the failed-read notice axe-clean and re-reads on click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AdminReadUnavailable message='Manual cost records could not be read.' />
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Manual cost records could not be read.'
    );
  });

  it('keeps a long message axe-clean', async () => {
    const long =
      'Publisher connection, playlist settings, distributor credentials and every scheduled pitch could not be read. Their status is unknown, not empty.';
    const { container } = render(<AdminReadUnavailable message={long} />);

    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps an RTL message axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AdminReadUnavailable message='تعذرت قراءة قيم الميزات.' />
      </div>
    );

    expect(screen.getByText('تعذرت قراءة قيم الميزات.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
