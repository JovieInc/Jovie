import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaybookPickerDialog } from './PlaybookPickerDialog';

function renderPicker(
  overrides: Partial<Parameters<typeof PlaybookPickerDialog>[0]> = {}
) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onOpenReleases: vi.fn(),
    ...overrides,
  };
  render(<PlaybookPickerDialog {...props} />);
  return props;
}

describe('PlaybookPickerDialog', () => {
  it('suggests the music release for artists and routes it to Releases', () => {
    const props = renderPicker({ creatorType: 'artist' });

    expect(screen.getByRole('radio', { name: /Music Release/ })).toBeChecked();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    expect(screen.getByText(/Jovie Assists/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create Tasks' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Releases' }));
    expect(props.onOpenReleases).toHaveBeenCalledTimes(1);
  });

  it('starts a date-anchored playbook once name and date are set', () => {
    const props = renderPicker({ creatorType: 'artist' });

    fireEvent.click(screen.getByRole('radio', { name: /Book Launch/ }));
    expect(screen.getByTestId('playbook-picker-sources')).toHaveTextContent(
      'Perennial Seller'
    );

    const submit = screen.getByRole('button', { name: 'Create Tasks' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '  The Quiet Launch  ' },
    });
    fireEvent.change(screen.getByLabelText('Publication Date'), {
      target: { value: '2027-03-01' },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(props.onSubmit).toHaveBeenCalledWith({
      playbookId: 'book-launch',
      projectName: 'The Quiet Launch',
      targetDate: '2027-03-01',
      autonomy: 'review',
    });
  });

  it('suggests the podcast episode for podcasters and labels it checklist-only', () => {
    renderPicker({ creatorType: 'podcaster' });

    const options = screen.getAllByRole('radio');
    expect(options[0]).toHaveAccessibleName(/Podcast Episode/);
    expect(options[0]).toBeChecked();
    expect(
      screen.getByTestId('playbook-option-podcast-episode')
    ).toHaveTextContent('Checklist Only');
  });

  it('blocks double submits while pending', () => {
    renderPicker({ creatorType: 'podcaster', pending: true });

    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
  });

  it('asks for the song story and sends the answers in prompt order', () => {
    const props = renderPicker({ creatorType: 'artist' });

    fireEvent.click(screen.getByRole('radio', { name: /17 Weekly Drops/ }));
    expect(screen.getByTestId('playbook-picker-intake')).toBeInTheDocument();
    // No shipped agent runs these steps, so there is no autonomy choice.
    expect(screen.queryByText('How Hands-On')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Night Drive' },
    });
    fireEvent.change(screen.getByLabelText('Single Release Date'), {
      target: { value: '2027-01-15' },
    });
    fireEvent.change(screen.getByLabelText(/what happened the day/i), {
      target: { value: 'We drove to the coast at 3am' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Tasks' }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookId: 'song-weekly-drops',
        autonomy: 'review',
        intakeAnswers: ['', 'We drove to the coast at 3am', '', '', ''],
      })
    );
  });

  it('sizes a founder feature launch', () => {
    const props = renderPicker({ creatorType: 'creator' });

    fireEvent.click(
      screen.getByRole('radio', { name: /Startup Feature Launch/ })
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Changelog Note' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Funnel judge' },
    });
    fireEvent.change(screen.getByLabelText('Announce Date'), {
      target: { value: '2027-01-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Tasks' }));

    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        playbookId: 'startup-feature-kit',
        launchDecision: 'changelog_notice',
      })
    );
    expect(props.onSubmit.mock.calls[0]?.[0]).not.toHaveProperty(
      'intakeAnswers'
    );
  });
});
