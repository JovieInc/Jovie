import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TimeLeverage } from '@/lib/ovie/time-leverage';
import { TimeLeverageView } from './TimeLeverageCard';

const data: TimeLeverage = {
  schema: 'time-leverage/v1',
  observedAt: '2026-10-29T17:00:00.000Z',
  windowDays: 7,
  tim: {
    totalMinutes: 600,
    humanOnlyMinutes: 240,
    humanOnlyPct: 40,
    categories: [
      {
        id: 'taste_call',
        label: 'Taste call',
        class: 'human_only',
        minutes: 120,
      },
      {
        id: 'status_ask',
        label: 'Status ask',
        class: 'automatable',
        minutes: 48,
      },
    ],
  },
  agent: { wastedAgentHours: 80, ciReworkRounds: 26, noOpWakes: 960 },
  proposals: [
    {
      id: 'a',
      title: 'Wake the coordinator only on state change',
      estimate: '17 agent-h/week',
      owner: 'Summer',
      score: 2.8,
    },
  ],
};

describe('TimeLeverageView', () => {
  it('shows the north-star percentage, the top leak and the proposals', () => {
    render(<TimeLeverageView data={data} />);
    expect(screen.getByTestId('hud-time-leverage').textContent).toContain(
      '40% human-only'
    );
    expect(screen.getByText(/Top leak: status ask, 48 min/)).toBeTruthy();
    expect(
      screen.getByText(/Wake the coordinator only on state change/)
    ).toBeTruthy();
  });

  it('shows n/a when no time was tracked', () => {
    render(
      <TimeLeverageView
        data={{
          ...data,
          tim: { ...data.tim, humanOnlyPct: null, categories: [] },
          proposals: [],
        }}
      />
    );
    expect(screen.getByText(/n\/a human-only/)).toBeTruthy();
    expect(screen.getByText(/No automatable leak/)).toBeTruthy();
  });
});
