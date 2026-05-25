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

    fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
