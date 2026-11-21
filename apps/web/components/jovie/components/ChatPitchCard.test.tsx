import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast }));

import { ChatPitchCard } from './ChatPitchCard';

const longBody = 'A driving synth-pop single. '.repeat(12);
const pitches = {
  spotify: 'Spotify copy',
  appleMusic: 'Apple copy',
  amazon: '',
  generic: 'General copy',
};

describe('ChatPitchCard', () => {
  let writeText: Mock<(data: string) => Promise<void>>;

  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    writeText = vi
      .fn<(data: string) => Promise<void>>()
      .mockResolvedValue(undefined);
  });

  // userEvent.setup() installs its own clipboard stub, so override it after.
  function setupUser() {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    return user;
  }

  it('renders nothing for a finished run without a pitch', () => {
    const { container } = render(<ChatPitchCard state='success' />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows loading placeholders', async () => {
    const { container } = render(<ChatPitchCard state='loading' />);

    expect(screen.getByText('Generating Pitch')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the error card', async () => {
    const { container } = render(
      <ChatPitchCard state='error' error='The model timed out.' />
    );

    expect(screen.getByText('Pitch Generation Failed')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists the platforms that have copy and copies one', async () => {
    const user = setupUser();
    const { container } = render(
      <ChatPitchCard state='success' releaseTitle='Sober' pitches={pitches} />
    );

    expect(screen.getByText('Spotify copy')).toBeInTheDocument();
    expect(screen.queryByText('Amazon Music')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Copy Spotify pitch' })
    );

    expect(writeText).toHaveBeenCalledWith('Spotify copy');
    expect(toast.success).toHaveBeenCalledWith('Spotify pitch copied');
  });

  it('reports a failed copy', async () => {
    const user = setupUser();
    writeText.mockRejectedValue(new Error('denied'));
    render(<ChatPitchCard state='success' pitches={pitches} />);

    await user.click(
      screen.getByRole('button', { name: 'Copy Spotify pitch' })
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to copy')
    );
  });

  it('expands a long single draft and copies the full draft with its subject', async () => {
    const user = setupUser();
    const { container } = render(
      <ChatPitchCard
        state='success'
        releaseTitle='Sober'
        pitch={{
          destinationLabel: 'Editorial',
          subjectLine: 'New single',
          body: longBody,
        }}
      />
    );

    const toggle = screen.getByRole('button', { name: 'Show more' });
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(
      screen.getByRole('button', { name: 'Copy full pitch draft' })
    );
    expect(writeText).toHaveBeenCalledWith(
      `Subject: New single\n\n${longBody}`
    );
  });
});
