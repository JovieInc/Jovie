import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectorCard } from '@/components/features/connectors/ConnectorCard';

describe('ConnectorCard', () => {
  it('renders connector status with the canonical Badge contract', () => {
    render(<ConnectorCard provider='gmail' status='not_connected' />);

    const status = screen.getByText('Not Connected');
    expect(status).toHaveAttribute('data-variant', 'outline');
    expect(status).toHaveAttribute('data-size', 'md');
  });

  it('keeps the connect action behavior while using canonical primitives', () => {
    const onConnect = vi.fn();
    render(
      <ConnectorCard
        provider='google_calendar'
        status='not_connected'
        onConnect={onConnect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });
});
