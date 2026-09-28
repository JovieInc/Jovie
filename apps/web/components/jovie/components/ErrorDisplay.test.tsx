import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
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
