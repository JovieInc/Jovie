import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import { DmQueueCard } from './DmQueueCard';

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const lead = {
  id: 'lead-1',
  displayName: 'Ari Lane',
  instagramHandle: 'arilane',
  priorityScore: 92,
  dmCopy: 'Hey Ari, your page is ready',
  outreachStatus: 'pending',
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('DmQueueCard', () => {
  it('shows the lead, a labelled read-only draft and stays axe-clean', async () => {
    const { container } = renderWithQueryClient(
      <DmQueueCard lead={lead} onMarkedSent={vi.fn()} />
    );
    const draft = screen.getByRole('textbox', {
      name: 'Direct Message Copy',
    });
    expect(draft).toHaveValue(lead.dmCopy);
    expect(draft).toHaveAttribute('readonly');
    expect(screen.getByText('Score: 92')).toBeVisible();
    expect(screen.getByRole('link', { name: /@arilane/ })).toHaveAttribute(
      'href',
      'https://instagram.com/arilane'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the draft value and focus across a rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithQueryClient(
      <DmQueueCard lead={lead} onMarkedSent={vi.fn()} />
    );
    const draft = screen.getByRole('textbox', { name: 'Direct Message Copy' });
    await user.type(draft, 'extra');
    rerender(<DmQueueCard lead={lead} onMarkedSent={vi.fn()} />);
    expect(
      screen.getByRole('textbox', { name: 'Direct Message Copy' })
    ).toHaveValue(lead.dmCopy);
    await user.tab();
    expect(
      screen.getByRole('textbox', { name: 'Direct Message Copy' })
    ).toHaveValue(lead.dmCopy);
  });

  it('disables copying when there is no draft', async () => {
    const { container } = renderWithQueryClient(
      <DmQueueCard
        lead={{ ...lead, dmCopy: null, priorityScore: null }}
        onMarkedSent={vi.fn()}
      />
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy DM' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('marks the lead sent, calls back and locks the actions', async () => {
    const user = userEvent.setup();
    const onMarkedSent = vi.fn();
    fetchMock.mockResolvedValue(Response.json({ id: 'lead-1' }));
    renderWithQueryClient(
      <DmQueueCard lead={lead} onMarkedSent={onMarkedSent} />
    );
    await user.click(screen.getByRole('button', { name: "Mark as DM'd" }));
    await waitFor(() => expect(onMarkedSent).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/leads/lead-1/dm-sent',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(screen.getByRole('button', { name: 'Sent' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy DM' })).toBeDisabled();
  });

  it('keeps the actions available when marking sent fails offline', async () => {
    const user = userEvent.setup();
    const onMarkedSent = vi.fn();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = renderWithQueryClient(
      <DmQueueCard lead={lead} onMarkedSent={onMarkedSent} />
    );
    await user.click(screen.getByRole('button', { name: "Mark as DM'd" }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: "Mark as DM'd" })).toBeEnabled()
    );
    expect(onMarkedSent).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('copies the draft to the clipboard and confirms', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderWithQueryClient(<DmQueueCard lead={lead} onMarkedSent={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copy DM' }));
    expect(writeText).toHaveBeenCalledWith(lead.dmCopy);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('renders a right-to-left draft axe-clean', async () => {
    const { container } = renderWithQueryClient(
      <DmQueueCard
        lead={{ ...lead, displayName: 'عدا', dmCopy: 'مرحبا عدا' }}
        onMarkedSent={vi.fn()}
      />
    );
    expect(screen.getByRole('textbox')).toHaveValue('مرحبا عدا');
    await expectNoA11yViolations(container);
  });
});
