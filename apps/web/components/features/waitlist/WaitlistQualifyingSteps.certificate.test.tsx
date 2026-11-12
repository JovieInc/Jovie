import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ARTIST_LINK_ERROR,
  GROWTH_ANSWER_MAX,
  WaitlistQualifyingSteps,
} from './WaitlistQualifyingSteps';
import type { QualifyingAnswers, QualifyingStep } from './waitlist-qualifying';

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: () => <span />,
}));
vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

const ARTIST_ID = '4Z8W4fKeB5YxbusRsdQVPb';
const EMPTY: QualifyingAnswers = {
  spotifyUrl: '',
  artistName: null,
  growth: '',
  spend: '',
};

function Harness({
  step,
  initial = EMPTY,
  submitting = false,
  label = 'first',
}: Readonly<{
  step: QualifyingStep;
  initial?: QualifyingAnswers;
  submitting?: boolean;
  label?: string;
}>) {
  const [answers, setAnswers] = useState(initial);
  return (
    <form data-render={label} onSubmit={event => event.preventDefault()}>
      <WaitlistQualifyingSteps
        step={step}
        answers={answers}
        submitting={submitting}
        onChange={next => setAnswers(current => ({ ...current, ...next }))}
        onBack={vi.fn()}
        onSkip={vi.fn()}
      />
    </form>
  );
}

describe('WaitlistQualifyingSteps certificate', () => {
  it('has no axe violations on each empty step', async () => {
    for (const step of ['artist', 'growth', 'spend'] as const) {
      const { container, unmount } = render(<Harness step={step} />);
      expect(screen.getByTestId('waitlist-qualifying-step')).toHaveAttribute(
        'data-step',
        step
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });

  it('keeps a typed growth answer and focus through a parent rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness step='growth' />);
    const field = screen.getByRole('textbox', {
      name: /last thing you did to grow your fans/i,
    });

    await user.type(field, 'Ran a pre-save.');
    rerender(<Harness step='growth' label='second' />);

    expect(
      screen.getByRole('textbox', {
        name: /last thing you did to grow your fans/i,
      })
    ).toBe(field);
    expect(field).toHaveValue('Ran a pre-save.');
    expect(field).toHaveFocus();
    expect(screen.getByText(`15/${GROWTH_ANSWER_MAX}`)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(field).toHaveValue('Ran a pre-save.');
    expect(field).toHaveFocus();

    await user.tab();
    expect(field).not.toHaveFocus();
    expect(field).toHaveValue('Ran a pre-save.');
  });

  it('keeps a typed artist search and focus through a parent rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness step='artist' />);
    const search = screen.getByRole('combobox', {
      name: 'Search Spotify artists',
    });

    await user.click(search);
    await user.type(search, 'Maya');
    rerender(<Harness step='artist' label='second' />);

    expect(search).toHaveValue('Maya');
    expect(search).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(search).toHaveValue('Maya');

    await user.tab();
    expect(search).not.toHaveFocus();
    expect(search).toHaveValue('Maya');
  });

  it('stops Continue on a link that names no artist and announces why', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault()
    );
    const { container } = render(
      <form onSubmit={onSubmit}>
        <WaitlistQualifyingSteps
          step='artist'
          answers={{
            ...EMPTY,
            spotifyUrl: 'https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo',
          }}
          submitting={false}
          onChange={vi.fn()}
          onBack={vi.fn()}
          onSkip={vi.fn()}
        />
      </form>
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(ARTIST_LINK_ERROR);
    await expectNoA11yViolations(container);
  });

  it('disables every action while the request is submitting', async () => {
    const { container } = render(
      <Harness
        step='artist'
        submitting
        initial={{
          ...EMPTY,
          spotifyUrl: `https://open.spotify.com/artist/${ARTIST_ID}`,
          artistName: 'Maya Vale',
        }}
      />
    );

    for (const name of ['Change', 'Continue', 'Back', 'Skip']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for long right-to-left answers', async () => {
    const { container } = render(
      <div dir='rtl'>
        <Harness
          step='artist'
          initial={{
            ...EMPTY,
            spotifyUrl: `https://open.spotify.com/artist/${ARTIST_ID}`,
            artistName:
              'فرقة الأوركسترا الإلكترونية الطويلة جدًا من الدار البيضاء والرباط',
          }}
        />
      </div>
    );

    expect(screen.getByTestId('waitlist-chosen-artist')).toHaveTextContent(
      'فرقة الأوركسترا'
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with a growth answer at the length limit', async () => {
    const { container } = render(
      <Harness
        step='growth'
        initial={{ ...EMPTY, growth: 'a'.repeat(GROWTH_ANSWER_MAX) }}
      />
    );

    expect(
      screen.getByText(`${GROWTH_ANSWER_MAX}/${GROWTH_ANSWER_MAX}`)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
