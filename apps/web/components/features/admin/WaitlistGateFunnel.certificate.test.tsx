import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WaitlistGateFunnel as WaitlistGateFunnelData } from '@/lib/admin/waitlist-gate-funnel';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistGateFunnel } from './WaitlistGateFunnel';

const funnel: WaitlistGateFunnelData = {
  byRole: [
    { role: 'artist', count: 214 },
    { role: 'manager', count: 38 },
  ],
  invite: {
    sent: 40,
    opened: 30,
    accountCreated: 20,
    goldenPathEntered: 10,
    goldenPathCompleted: 4,
  },
  p50HoursSentToGoldenPath: 0.5,
};

describe('WaitlistGateFunnel certificate', () => {
  it('shows role counts and per-stage conversion of sent invites', async () => {
    const { container } = render(<WaitlistGateFunnel funnel={funnel} />);

    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByText('75% of sent')).toBeInTheDocument();
    expect(screen.getByText('10% of sent')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows no rate and a dash median before any invite is sent', async () => {
    const { container } = render(
      <WaitlistGateFunnel
        funnel={{
          byRole: [],
          invite: {
            sent: 0,
            opened: 0,
            accountCreated: 0,
            goldenPathEntered: 0,
            goldenPathCompleted: 0,
          },
          p50HoursSentToGoldenPath: null,
        }}
      />
    );

    expect(screen.queryByText(/% of sent/)).toBeNull();
    expect(screen.getByText('–')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps large counts and a multi-day median axe-clean in RTL', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WaitlistGateFunnel
          funnel={{
            ...funnel,
            byRole: [{ role: 'artist', count: 1_234_567 }],
            p50HoursSentToGoldenPath: 1_234,
          }}
        />
      </div>
    );

    expect(screen.getByText((1_234_567).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('51.4d')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('formats a same-day median in hours', () => {
    render(
      <WaitlistGateFunnel
        funnel={{ ...funnel, p50HoursSentToGoldenPath: 19.5 }}
      />
    );
    expect(screen.getByText('19.5h')).toBeInTheDocument();
  });
});
