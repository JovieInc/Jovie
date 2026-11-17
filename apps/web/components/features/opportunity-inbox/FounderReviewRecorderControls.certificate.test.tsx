import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FounderReviewRecorderControls } from './FounderReviewRecorderControls';

const TARGET = {
  type: 'inbox-card' as const,
  id: 'card-1',
  title: 'Refresh a weak YouTube thumbnail',
  sourceKind: 'youtube.thumbnail_candidate',
  category: 'suggestion',
} as const;

type ControlsProps = Parameters<typeof FounderReviewRecorderControls>[0];

const handlers = () => ({
  onStart: vi.fn(),
  onStop: vi.fn(),
  onTypedTextChange: vi.fn(),
  onKeepAudioChange: vi.fn(),
  onAllowContentUseChange: vi.fn(),
  onDeleteAudio: vi.fn(),
  onSaveNote: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
});

function baseProps(overrides: Partial<ControlsProps> = {}): ControlsProps {
  return {
    target: TARGET,
    sessionActive: false,
    transcript: '',
    typedText: '',
    keepAudio: false,
    allowContentUse: false,
    saving: false,
    error: null,
    latestReceipt: null,
    ...handlers(),
    ...overrides,
  };
}

/** A parent that owns the note, as the inbox page does. */
function StatefulRecorder({
  transcript,
  onTypedTextChange,
}: {
  readonly transcript: string;
  readonly onTypedTextChange: (value: string) => void;
}) {
  const [typedText, setTypedText] = useState('');
  return (
    <FounderReviewRecorderControls
      {...baseProps({ transcript, sessionActive: Boolean(transcript) })}
      typedText={typedText}
      onTypedTextChange={value => {
        setTypedText(value);
        onTypedTextChange(value);
      }}
    />
  );
}

describe('FounderReviewRecorderControls certificate', () => {
  it('keeps a typed note and its focus through a live transcript re-render, Escape and blur', async () => {
    const user = userEvent.setup();
    const onTypedTextChange = vi.fn();
    const { rerender } = render(
      <StatefulRecorder transcript='' onTypedTextChange={onTypedTextChange} />
    );

    const notes = screen.getByLabelText('Notes');
    await user.click(notes);
    await user.type(notes, 'Pull the old cover art');
    expect(notes).toHaveValue('Pull the old cover art');
    expect(onTypedTextChange).toHaveBeenLastCalledWith(
      'Pull the old cover art'
    );

    rerender(
      <StatefulRecorder
        transcript='Approve this one.'
        onTypedTextChange={onTypedTextChange}
      />
    );
    expect(screen.getByText('Approve this one.')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBe(notes);
    expect(notes).toHaveFocus();
    expect(notes).toHaveValue('Pull the old cover art');

    await user.keyboard('{Escape}');
    expect(notes).toHaveValue('Pull the old cover art');
    await user.tab();
    expect(notes).not.toHaveFocus();
    expect(notes).toHaveValue('Pull the old cover art');
  });

  it('shows the empty transcript placeholder axe-clean', async () => {
    const { container } = render(
      <FounderReviewRecorderControls {...baseProps()} />
    );
    expect(
      screen.getByText('Your transcript will appear here.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces a refused microphone and keeps typed notes usable', async () => {
    const user = userEvent.setup();
    const props = baseProps({
      error: 'Microphone permission was denied. Typed notes still work.',
    });
    const { container } = render(<FounderReviewRecorderControls {...props} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Microphone permission was denied.'
    );
    await user.type(screen.getByLabelText('Notes'), 'a');
    expect(props.onTypedTextChange).toHaveBeenCalledWith('a');
    await expectNoA11yViolations(container);
  });

  it('clamps a long transcript and stays axe-clean while recording', async () => {
    const transcript =
      'Approve this one. The new thumbnail reads better at feed size. '.repeat(
        6
      );
    const { container } = render(
      <FounderReviewRecorderControls
        {...baseProps({ sessionActive: true, transcript })}
      />
    );
    expect(screen.getByText(transcript.trim(), { exact: false })).toHaveClass(
      'line-clamp-3'
    );
    expect(
      screen.getByRole('button', { name: /Stop And Save/ })
    ).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FounderReviewRecorderControls
          {...baseProps({
            transcript: 'وافق على هذه الصورة المصغرة.',
            typedText: 'أزل الغلاف القديم.',
          })}
        />
      </div>
    );
    expect(screen.getByLabelText('Notes')).toHaveValue('أزل الغلاف القديم.');
    await expectNoA11yViolations(container);
  });
});
