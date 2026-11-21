import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast }));

import { buildCopyMenuItems, CopyableField } from './CopyableField';

function setup(writeText: Mock<(data: string) => Promise<void>>) {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
  return user;
}

describe('CopyableField', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });

  it('shows the value as a labelled copy button', async () => {
    const { container } = render(
      <CopyableField value='tim@jovie.com' label='Email' />
    );

    expect(
      screen.getByRole('button', { name: /tim@jovie.com/ })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Copy Email')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('copies, toasts and flips to the copied icon', async () => {
    const writeText = vi
      .fn<(data: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const user = setup(writeText);
    const { container } = render(
      <CopyableField value='tim@jovie.com' label='Email' />
    );

    await user.click(screen.getByRole('button'));

    expect(writeText).toHaveBeenCalledWith('tim@jovie.com');
    expect(toast.success).toHaveBeenCalledWith('Copied');
    expect(await screen.findByLabelText('Copied')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('skips the toast when showToast is off', async () => {
    const user = setup(
      vi.fn<(data: string) => Promise<void>>().mockResolvedValue(undefined)
    );
    render(<CopyableField value='x' label='X' showToast={false} />);

    await user.click(screen.getByRole('button'));

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports a failed copy', async () => {
    const user = setup(
      vi
        .fn<(data: string) => Promise<void>>()
        .mockRejectedValue(new Error('denied'))
    );
    render(<CopyableField value='x' label='X' />);

    await user.click(screen.getByRole('button'));

    expect(toast.error).toHaveBeenCalledWith('Failed to copy');
  });

  it('renders custom children in place of the value', () => {
    render(
      <CopyableField value='USQX5' label='ISRC'>
        <code>custom</code>
      </CopyableField>
    );

    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('builds copy menu items and drops empty values', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .fn<(data: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    const items = buildCopyMenuItems([
      { id: 'email', label: 'Email', value: 'a@b.co' },
      { id: 'empty', label: 'Empty', value: '' },
      null,
    ]);

    expect(items.map(item => item.id)).toEqual(['copy-email']);
    items[0].onClick();
    expect(writeText).toHaveBeenCalledWith('a@b.co');
    expect(user).toBeDefined();
  });
});
