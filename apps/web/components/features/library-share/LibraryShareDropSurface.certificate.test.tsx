import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LibraryShareDropSurface } from './LibraryShareDropSurface';
import { WEB171_DROP_VIEW } from './LibraryShareDropSurface.stories';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const lockedView = { ...WEB171_DROP_VIEW, requiresPassphrase: true };

describe('LibraryShareDropSurface certificate', () => {
  it('unlocks a passphrase drop and refreshes the route', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <LibraryShareDropSurface view={lockedView} initialUnlocked={false} />
    );
    await expectNoA11yViolations(container);

    const field = screen.getByLabelText('Passphrase');
    await user.type(field, 'open sesame');
    expect(field).toHaveValue('open sesame');
    await user.click(screen.getByRole('button', { name: 'Unlock drop' }));

    await waitFor(() =>
      expect(screen.getByTestId('library-share-drop-surface')).toBeVisible()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/library/share-drops/drop-token/unlock',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ passphrase: 'open sesame' }),
      })
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps the gate and shows an error for a wrong passphrase', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    );
    const { container } = render(
      <LibraryShareDropSurface view={lockedView} initialUnlocked={false} />
    );

    await user.type(screen.getByLabelText('Passphrase'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Unlock drop' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect passphrase. Try again.'
    );
    expect(screen.queryByTestId('library-share-drop-surface')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('tells the visitor an expired drop needs a fresh link', async () => {
    const { container } = render(
      <LibraryShareDropSurface
        view={{ ...WEB171_DROP_VIEW, isExpired: true }}
        initialUnlocked
      />
    );

    expect(
      screen.getByRole('heading', { name: 'This Drop Has Expired' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Ask ${WEB171_DROP_VIEW.artistName} for a fresh link.`)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders an empty drop and a right-to-left drop axe-clean', async () => {
    const { container, rerender } = render(
      <LibraryShareDropSurface
        view={{ ...WEB171_DROP_VIEW, assets: [] }}
        initialUnlocked
      />
    );
    expect(screen.getByTestId('library-share-empty')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <LibraryShareDropSurface
          view={{ ...WEB171_DROP_VIEW, title: 'مجموعة الصحافة' }}
          initialUnlocked
        />
      </div>
    );
    expect(screen.getByText('مجموعة الصحافة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
