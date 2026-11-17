import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import type { ChatError } from '../types';
import { ErrorDisplay } from './ErrorDisplay';

describe('ErrorDisplay', () => {
  it('renders as an inline chat alert with retry and support reference actions', () => {
    const onRetry = vi.fn();

    fastRender(
      <ErrorDisplay
        chatError={{
          type: 'server',
          message: 'The model timed out.',
          errorCode: 'CHAT_TIMEOUT',
          requestId: 'req_123',
          failedMessage: 'Retry this',
        }}
        onRetry={onRetry}
        isLoading={false}
        isSubmitting={false}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Message paused');
    expect(alert).toHaveTextContent('The model timed out.');
    expect(screen.getByText('Message paused')).toBeInTheDocument();
    expect(screen.getByText('CHAT_TIMEOUT · req_123')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry Message' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders recoverable tool failures without the message paused headline', () => {
    fastRender(
      <ErrorDisplay
        chatError={{
          type: 'tool',
          message: 'Retouch is not provisioned for this account.',
          errorCode: 'TOOL_UNPROVISIONED',
          suppressComposerPause: true,
        }}
        onRetry={vi.fn()}
        isLoading={false}
        isSubmitting={false}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Action could not finish');
    expect(alert).not.toHaveTextContent('Message paused');
    expect(alert).not.toHaveTextContent('Something went wrong');
    expect(
      screen.queryByRole('button', { name: 'Retry Message' })
    ).not.toBeInTheDocument();
  });

  it('keeps the Ovie briefing actionable after a temporary reply failure', () => {
    fastRender(
      <ErrorDisplay
        chatError={{
          type: 'server',
          message: 'We encountered a temporary issue. Please try again.',
          failedMessage: 'What matters now?',
        }}
        onRetry={vi.fn()}
        isLoading={false}
        isSubmitting={false}
        presentation='operator'
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Summer Didn’t Finish That Reply');
    expect(alert).toHaveTextContent(
      'Your briefing is still current. Retry this message or ask something else.'
    );
    expect(alert).not.toHaveTextContent('Message paused');
    expect(alert).not.toHaveTextContent('temporary issue');
    expect(screen.getByRole('button', { name: 'Retry Message' })).toBeEnabled();
  });
});

function renderError(
  chatError: ChatError,
  props: Partial<{
    isLoading: boolean;
    isSubmitting: boolean;
    onRetry: () => void;
    dir: 'rtl';
  }> = {}
) {
  return fastRender(
    <div dir={props.dir}>
      <ErrorDisplay
        chatError={chatError}
        onRetry={props.onRetry ?? vi.fn()}
        isLoading={props.isLoading ?? false}
        isSubmitting={props.isSubmitting ?? false}
      />
    </div>
  );
}

const serverError: ChatError = {
  type: 'server',
  message: 'The model timed out.',
  errorCode: 'CHAT_TIMEOUT',
  requestId: 'req_123',
  failedMessage: 'Retry this',
};

describe('ErrorDisplay states', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is axe-clean for a server failure with a reference and retry', async () => {
    const { container } = renderError(serverError);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Try again or contact support if this persists'
    );
    await expectNoA11yViolations(container);
  });

  it('retries from the keyboard and blocks a second send while one is in flight', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = renderError(serverError, { onRetry });
    await user.click(screen.getByRole('button', { name: 'Retry Message' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <div>
        <ErrorDisplay
          chatError={serverError}
          onRetry={onRetry}
          isLoading={false}
          isSubmitting
        />
      </div>
    );
    const retry = screen.getByRole('button', { name: 'Retry Message' });
    expect(retry).toBeDisabled();
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry while the chat is loading and stays axe-clean', async () => {
    const { container } = renderError(serverError, { isLoading: true });
    expect(
      screen.getByRole('button', { name: 'Retry Message' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('copies the support reference and confirms it briefly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    // userEvent.setup installs its own clipboard, so stub it afterwards.
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    renderError(serverError);
    await user.click(
      screen.getByRole('button', { name: 'Copy Support Reference' })
    );
    expect(writeText).toHaveBeenCalledWith('CHAT_TIMEOUT · req_123');
    expect(
      screen.getByRole('button', { name: 'Copy Support Reference' })
    ).toHaveTextContent('Copied');
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(
      screen.getByRole('button', { name: 'Copy Support Reference' })
    ).toHaveTextContent('Copy');
  });

  it('keeps the reference in place when the clipboard is refused', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { container } = renderError(serverError);
    await user.click(
      screen.getByRole('button', { name: 'Copy Support Reference' })
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Copy Support Reference' })
    ).toHaveTextContent('Copy');
    expect(screen.getByText('CHAT_TIMEOUT · req_123')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the connection step and no reference when offline', async () => {
    const { container } = renderError({
      type: 'network',
      message: 'You appear to be offline.',
      failedMessage: 'Check your connection',
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Check your connection and try again');
    expect(screen.queryByText('Reference')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry Message' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('holds retry back while a rate limit is still counting down', async () => {
    const { container } = renderError({
      type: 'rate_limit',
      message: 'You have sent a lot of messages.',
      retryAfter: 30,
      failedMessage: 'One more',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Wait a moment, then try again'
    );
    expect(screen.queryByRole('button', { name: 'Retry Message' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows a tool the account cannot use without offering a resend', async () => {
    const { container } = renderError({
      type: 'tool',
      message: 'Retouch is not provisioned for this account.',
      errorCode: 'TOOL_UNPROVISIONED',
      suppressComposerPause: true,
    });
    expect(screen.getByText('TOOL_UNPROVISIONED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry Message' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('wraps a long message and reference without dropping either', async () => {
    const message =
      'The reply could not finish because the upstream model returned an incomplete stream after a long tool run that touched several catalog records and a release plan.';
    const { container } = renderError({
      type: 'unknown',
      message,
      errorCode: 'CHAT_STREAM_INCOMPLETE_AFTER_TOOL_RUN',
      requestId: 'req_0123456789abcdef0123456789abcdef',
      failedMessage: 'Plan the release',
    });
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(
      screen.getByText(
        'CHAT_STREAM_INCOMPLETE_AFTER_TOOL_RUN · req_0123456789abcdef0123456789abcdef'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Try again or contact support'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left thread', async () => {
    const { container } = renderError(
      {
        type: 'server',
        message: 'انتهت مهلة النموذج. حاول مرة أخرى.',
        errorCode: 'CHAT_TIMEOUT',
        failedMessage: 'أعد المحاولة',
      },
      { dir: 'rtl' }
    );
    expect(screen.getByRole('alert')).toHaveTextContent('انتهت مهلة النموذج');
    await expectNoA11yViolations(container);
  });
});
