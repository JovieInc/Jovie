import { createAudioTimelineDocument } from '@jovie/audio-contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CueEditorPopover } from './CueEditorPopover';

function timeline() {
  return createAudioTimelineDocument({
    trackId: 'track-1',
    revision: 0,
    sampleRateHz: 48_000,
    durationSamples: 480_000,
    cues: [
      {
        id: 'cue_drop',
        kind: 'drop',
        label: 'Drop',
        sampleOffset: 240_000,
      },
    ],
    beatGrid: null,
  });
}

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof CueEditorPopover>> = {}
) {
  const props: React.ComponentProps<typeof CueEditorPopover> = {
    timeline: timeline(),
    currentTime: 2,
    canUndo: false,
    canRedo: false,
    onEdit: vi.fn().mockReturnValue(true),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onJump: vi.fn(),
    ...overrides,
  };
  return { ...render(<CueEditorPopover {...props} />), props };
}

describe('CueEditorPopover', () => {
  it('adds a typed cue at the sample-indexed playhead', async () => {
    const user = userEvent.setup();
    const randomUUID = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('12345678-1234-1234-1234-123456789abc');
    const { props } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit Cues' }));
    await user.selectOptions(screen.getByRole('combobox'), 'verse');
    await user.click(screen.getByRole('button', { name: 'Add at 0:02' }));

    expect(props.onEdit).toHaveBeenCalledWith({
      type: 'add',
      cue: {
        id: 'cue_12345678123412341234123456789abc',
        kind: 'verse',
        label: 'Verse 2',
        sampleOffset: 96_000,
      },
    });
    randomUUID.mockRestore();
  });

  it('renames by keyboard and cancels a later rename with Escape', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Edit Cues' }));
    await user.click(screen.getByRole('button', { name: 'Rename Drop' }));
    const input = screen.getByRole('textbox', { name: 'Rename Drop' });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'First Drop{Enter}');
    expect(props.onEdit).toHaveBeenCalledWith({
      type: 'rename',
      cueId: 'cue_drop',
      label: 'First Drop',
    });

    await user.click(screen.getByRole('button', { name: 'Rename Drop' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('jumps, moves, deletes, undoes, and redoes without a playback control', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ canUndo: true, canRedo: true });

    await user.click(screen.getByRole('button', { name: 'Edit Cues' }));
    await user.click(
      screen.getByRole('button', { name: 'Jump to Drop at 0:05' })
    );
    await user.click(screen.getByRole('button', { name: 'Move Drop to 0:02' }));
    await user.click(screen.getByRole('button', { name: 'Delete Drop' }));
    await user.click(screen.getByRole('button', { name: 'Undo Cue Change' }));
    await user.click(screen.getByRole('button', { name: 'Redo Cue Change' }));

    expect(props.onJump).toHaveBeenCalledWith('cue_drop');
    expect(props.onEdit).toHaveBeenCalledWith({
      type: 'move',
      cueId: 'cue_drop',
      sampleOffset: 96_000,
    });
    expect(props.onEdit).toHaveBeenCalledWith({
      type: 'delete',
      cueId: 'cue_drop',
    });
    expect(props.onUndo).toHaveBeenCalledOnce();
    expect(props.onRedo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /^Play|^Pause/ })).toBeNull();
  });

  it('fails closed for occupied playhead positions and unavailable history', async () => {
    const user = userEvent.setup();
    renderEditor({ currentTime: 5 });

    await user.click(screen.getByRole('button', { name: 'Edit Cues' }));
    expect(screen.getByRole('button', { name: 'Add at 0:05' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Move Drop to 0:05' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Undo Cue Change' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Redo Cue Change' })
    ).toBeDisabled();
  });
});
