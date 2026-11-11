import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatPresenceArtifactCard } from './ChatPresenceArtifactCard';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/components/feedback', () => ({ toast }));

describe('ChatPresenceArtifactCard', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('holds the artifact slot while the step runs', async () => {
    const { container } = render(
      <ChatPresenceArtifactCard state='loading' title='Work opportunities' />
    );

    expect(screen.getByText('Work opportunities')).toBeInTheDocument();
    expect(
      screen.getByText('Working with data already on your profile…')
    ).toBeInTheDocument();
    expect(screen.getByTestId('chat-presence-artifact-loading')).toHaveClass(
      'min-h-16'
    );
    await expectNoA11yViolations(container);
  });

  it('reports a failed step with the error and no retry', async () => {
    const { container } = render(
      <ChatPresenceArtifactCard
        state='error'
        title='Work opportunities'
        error='Work presence lookup failed.'
      />
    );

    expect(screen.getByText('Work opportunities failed')).toBeInTheDocument();
    expect(
      screen.getByText('Work presence lookup failed.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to generic copy for an error without a message', () => {
    render(<ChatPresenceArtifactCard state='error' />);
    expect(screen.getByText('Presence task failed')).toBeInTheDocument();
    expect(
      screen.getByText('Something went wrong while building this artifact.')
    ).toBeInTheDocument();
  });

  it('shows the empty notice only when nothing is verified', async () => {
    const { container, rerender } = render(
      <ChatPresenceArtifactCard state='success' empty />
    );
    expect(
      screen.getByText(
        'Nothing verified yet — connect sources to fill this in.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <ChatPresenceArtifactCard
        state='success'
        empty
        facts={[{ label: 'Stats', value: 'Not connected' }]}
      />
    );
    expect(screen.queryByText(/Nothing verified yet/)).toBeNull();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
  });

  it('copies the draft, confirms, and resets the label', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const { container } = render(
      <ChatPresenceArtifactCard
        state='success'
        title='Welcome post'
        draftText='My new single is out now.'
        href='https://jov.ie/midnight-drive'
      />
    );

    const link = screen.getByRole('link', { name: 'Open Link' });
    expect(link).toHaveAttribute('href', 'https://jov.ie/midnight-drive');
    expect(link).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'Copy draft' }));
    expect(writeText).toHaveBeenCalledWith('My new single is out now.');
    expect(toast.success).toHaveBeenCalledWith('Draft copied');
    expect(
      screen.getByRole('button', { name: 'Draft copied' })
    ).toHaveTextContent('Copied');
    await expectNoA11yViolations(container);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy draft' })).toBeVisible();
  });

  it('tells the artist when the copy fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied')
    );
    render(<ChatPresenceArtifactCard state='success' draftText='Draft' />);

    await user.click(screen.getByRole('button', { name: 'Copy draft' }));
    expect(toast.error).toHaveBeenCalledWith('Failed to copy');
    expect(screen.getByRole('button', { name: 'Copy draft' })).toBeVisible();
  });

  it('keeps long and right-to-left facts readable', async () => {
    const long =
      'Los Angeles producer whose deluxe anniversary edition reached listeners in forty-two countries. '.repeat(
        3
      );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatPresenceArtifactCard
          state='success'
          title='ملف الفنان'
          facts={[
            { label: 'Bio', value: long },
            { label: 'المدينة', value: 'القاهرة' },
          ]}
        />
      </div>
    );

    expect(screen.getByText(long.trim())).toHaveClass('break-words');
    expect(screen.getByText('القاهرة')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
