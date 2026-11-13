import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OUTBOUND_VIEW_LABELS, OUTBOUND_VIEWS } from '@/lib/outbound/types';
import { OutboundViews } from './OutboundViews';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';

const counts = outboundFixtureQueue([
  outboundFixtureRow(),
  outboundFixtureRow({ view: 'sent' }),
]).counts;

describe('OutboundViews', () => {
  it('retains every view and its exact count, including zero, in the keyboard menu', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    render(
      <OutboundViews view='ready' counts={counts} onViewChange={onViewChange} />
    );
    const trigger = screen.getByRole('button', { name: /All Outbound views/ });
    trigger.focus();
    await user.keyboard('{Enter}');
    for (const view of OUTBOUND_VIEWS) {
      expect(
        screen.getByRole('menuitemradio', {
          name: `${OUTBOUND_VIEW_LABELS[view]} ${counts[view]}`,
        })
      ).toBeInTheDocument();
    }
    await user.click(screen.getByRole('menuitemradio', { name: 'Sent 1' }));
    expect(onViewChange).toHaveBeenCalledWith('sent');
  });

  it('keeps a secondary selection named in the trigger without inventing loading counts', () => {
    render(<OutboundViews view='sent' onViewChange={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'All Outbound views, current: Sent' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Sent 0')).toBeNull();
  });
});
