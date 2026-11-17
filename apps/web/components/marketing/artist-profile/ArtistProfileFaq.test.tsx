import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import meta, { EmptyQuestions } from './ArtistProfileFaq.states.stories';

type Props = ComponentProps<typeof ArtistProfileFaq>;
const props = (story: { args?: Partial<Props> }) =>
  ({ ...meta.args, ...story.args }) as Props;

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track }));

const { faq } = ARTIST_PROFILE_COPY;

describe('ArtistProfileFaq', () => {
  beforeEach(() => track.mockClear());

  it('opens a question, reports it once, and closes it again', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtistProfileFaq faq={faq} />);
    expect(container.querySelector('#faq')).toHaveClass('artist-profile-faq');
    const [first] = faq.items;
    const trigger = screen.getByRole('button', { name: first.question });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(first.answer)).toBeVisible();
    expect(track).toHaveBeenCalledWith('artist_profiles_faq_opened', {
      source: 'artist-profiles',
      question: first.question,
      index: 0,
    });
    await expectNoA11yViolations(container);

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('moves focus between questions with the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<ArtistProfileFaq faq={faq} />);
    const triggers = screen.getAllByRole('button');
    expect(triggers).toHaveLength(faq.items.length);
    triggers[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(triggers[1]).toHaveFocus();
    await user.keyboard('{End}');
    expect(triggers[triggers.length - 1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(triggers[0]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(triggers[triggers.length - 1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(triggers[0]).toHaveFocus();
  });

  it('keeps the heading and renders no questions when the list is empty', async () => {
    const { container } = render(
      <ArtistProfileFaq {...props(EmptyQuestions)} />
    );
    expect(
      screen.getByRole('heading', { level: 2, name: faq.headline })
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });
});
