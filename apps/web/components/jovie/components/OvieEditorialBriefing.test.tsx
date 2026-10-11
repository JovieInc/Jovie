import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OvieHomeBriefing } from '@/lib/ovie/home-briefing';
import { fastRender } from '@/tests/utils/fast-render';
import { OvieEditorialBriefing } from './OvieEditorialBriefing';

const briefing: OvieHomeBriefing = {
  greeting: 'Good morning, Tim.',
  updatedLabel: 'Updated Sep 28, 8:00 AM PDT',
  signal: {
    id: 'activation.first-user',
    title: 'The first real user completed onboarding',
    summary: 'Activation has moved from theory to observed behavior.',
    currentValue: '1 activated user',
    delta: '+1 today',
    target: 'Learn what made the path work',
    sourceLabel: 'Founder Funnel',
    nextAction: 'Review the session and preserve the shortest successful path.',
    removalEvent: 'The activation lesson is recorded and applied.',
    summerCanAct: true,
  },
  actions: [
    {
      id: 'activation.first-user:next',
      label: 'Start The Next Step',
      prompt: 'Review the first activation with me.',
    },
    {
      id: 'activation.first-user:evidence',
      label: 'Show The Evidence',
      prompt: 'Show the evidence for the first activation.',
    },
  ],
};

describe('OvieEditorialBriefing', () => {
  it('renders one current signal and sends its contextual action prompt', () => {
    const onSelectAction = vi.fn();
    fastRender(
      <OvieEditorialBriefing
        briefing={briefing}
        onSelectAction={onSelectAction}
      />
    );

    expect(screen.getByTestId('ovie-home-greeting')).toHaveTextContent(
      'Good morning, Tim.'
    );
    expect(
      screen.getByRole('heading', {
        name: 'The first real user completed onboarding',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('ovie-editorial-briefing')).toHaveAttribute(
      'data-signal-id',
      'activation.first-user'
    );
    expect(screen.getByTestId('ovie-home-actions')).toHaveTextContent(
      'Show The Evidence'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show The Evidence' }));
    expect(onSelectAction).toHaveBeenCalledExactlyOnceWith(
      'Show the evidence for the first activation.'
    );
  });
});
