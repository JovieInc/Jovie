import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UtmBuilderDialog } from './UtmBuilderDialog';

const copyToClipboard = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/hooks/useClipboard', () => ({ copyToClipboard }));
vi.mock('@/components/feedback', () => ({ toast }));

const BASE_URL = 'https://jov.ie/tim';

beforeEach(() => {
  copyToClipboard.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe('UtmBuilderDialog', () => {
  it('keeps typed values and focus across a parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <UtmBuilderDialog open embedded baseUrl={BASE_URL} />
    );

    const source = screen.getByRole('textbox', { name: /source/i });
    await user.type(source, 'instagram');
    await user.type(screen.getByRole('textbox', { name: /campaign/i }), 'tour');
    await user.click(source);

    rerender(<UtmBuilderDialog open embedded baseUrl={BASE_URL} />);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('textbox', { name: /source/i })).toHaveValue(
      'instagram'
    );
    expect(screen.getByRole('textbox', { name: /campaign/i })).toHaveValue(
      'tour'
    );
    expect(screen.getByRole('textbox', { name: /source/i })).toHaveFocus();
    expect(
      screen.getByText(`${BASE_URL}?utm_source=instagram&utm_campaign=tour`)
    ).toBeVisible();
  });

  it('keeps Copy and Open disabled with an inline rule until a source is set', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const { container } = render(
      <UtmBuilderDialog
        open
        embedded
        baseUrl={BASE_URL}
        initialValues={{ utm_medium: 'social' }}
      />
    );

    expect(
      screen.getByText(
        'Add a source (like instagram) to create your tracking link.'
      )
    ).toBeVisible();
    const copy = screen.getByRole('button', { name: 'Copy link' });
    const open = screen.getByRole('button', { name: 'Open' });
    expect(copy).toBeDisabled();
    expect(open).toBeDisabled();
    await user.click(open);
    expect(openSpy).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);

    await user.type(screen.getByRole('textbox', { name: /source/i }), 'tiktok');
    expect(copy).toBeEnabled();
    await user.click(open);
    expect(openSpy).toHaveBeenCalledWith(
      `${BASE_URL}?utm_source=tiktok&utm_medium=social`,
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('copies the tracking link and confirms it', async () => {
    const user = userEvent.setup();
    copyToClipboard.mockResolvedValue(true);
    render(
      <UtmBuilderDialog
        open
        embedded
        baseUrl={BASE_URL}
        initialValues={{ utm_source: 'instagram' }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(copyToClipboard).toHaveBeenCalledWith(
      `${BASE_URL}?utm_source=instagram`
    );
    expect(toast.success).toHaveBeenCalledWith('Tracking link copied');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('reports a failed copy', async () => {
    const user = userEvent.setup();
    copyToClipboard.mockResolvedValue(false);
    render(
      <UtmBuilderDialog
        open
        embedded
        baseUrl={BASE_URL}
        initialValues={{ utm_source: 'instagram' }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(toast.error).toHaveBeenCalledWith('Failed to copy');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  it('renders the fields in the modal dialog and stays axe-clean', async () => {
    render(
      <UtmBuilderDialog
        open
        onClose={vi.fn()}
        baseUrl={BASE_URL}
        initialValues={{ utm_source: 'instagram', utm_campaign: 'summer' }}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: 'UTM Builder' })).toBeVisible();
    expect(
      screen.getByText(`${BASE_URL}?utm_source=instagram&utm_campaign=summer`)
    ).toBeVisible();
    await expectNoA11yViolations(dialog);
  });

  it('keeps right-to-left values axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <UtmBuilderDialog
          open
          embedded
          baseUrl={BASE_URL}
          initialValues={{ utm_source: 'انستغرام' }}
        />
      </div>
    );

    expect(screen.getByRole('textbox', { name: /source/i })).toHaveValue(
      'انستغرام'
    );
    await expectNoA11yViolations(container);
  });
});
