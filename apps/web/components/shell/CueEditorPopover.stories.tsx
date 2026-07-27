import {
  type AudioTimelineEdit,
  applyAudioTimelineHistoryEdit,
  createAudioTimelineDocument,
  createAudioTimelineHistory,
  redoAudioTimelineEdit,
  undoAudioTimelineEdit,
} from '@jovie/audio-contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { CueEditorPopover } from './CueEditorPopover';

const initialTimeline = createAudioTimelineDocument({
  trackId: 'storybook-cue-editor',
  revision: 0,
  sampleRateHz: 48_000,
  durationSamples: 8_640_000,
  cues: [
    { id: 'cue_intro', kind: 'intro', label: 'Intro', sampleOffset: 0 },
    {
      id: 'cue_first_drop',
      kind: 'drop',
      label: 'First drop',
      sampleOffset: 2_880_000,
    },
  ],
  beatGrid: null,
});

const meta = {
  title: 'Shell/CueEditorPopover',
  component: CueEditorPopover,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CueEditorPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Docked: Story = {
  render: function DockedCueEditor() {
    const [history, setHistory] = useState(() =>
      createAudioTimelineHistory(initialTimeline)
    );
    const [currentTime, setCurrentTime] = useState(82);

    const edit = (timelineEdit: AudioTimelineEdit): boolean => {
      setHistory(current =>
        applyAudioTimelineHistoryEdit(current, {
          expectedRevision: current.present.revision,
          edit: timelineEdit,
        })
      );
      return true;
    };

    return (
      <main className='min-h-screen bg-surface-0 text-primary-token'>
        <div className='mx-auto max-w-3xl px-6 pt-24'>
          <p className='text-sm text-tertiary-token'>Release workspace</p>
        </div>
        <div
          data-testid='cue-proof-dock'
          className='fixed inset-x-4 bottom-4 flex h-16 items-center justify-between rounded-xl border border-subtle bg-surface-1 px-4 shadow-lg'
        >
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium'>
              Sample-indexed timeline
            </p>
            <p className='text-xs tabular-nums text-tertiary-token'>
              1:22 / 3:00
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <input
              aria-label='Proof playhead'
              type='range'
              min={0}
              max={180}
              value={currentTime}
              onChange={event => setCurrentTime(Number(event.target.value))}
              className='w-32'
            />
            <CueEditorPopover
              timeline={history.present}
              currentTime={currentTime}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              onEdit={edit}
              onUndo={() =>
                setHistory(current =>
                  undoAudioTimelineEdit(current, current.present.revision)
                )
              }
              onRedo={() =>
                setHistory(current =>
                  redoAudioTimelineEdit(current, current.present.revision)
                )
              }
              onJump={cueId => {
                const cue = history.present.cues.find(
                  item => item.id === cueId
                );
                if (cue) setCurrentTime(cue.sampleOffset / 48_000);
              }}
            />
          </div>
        </div>
      </main>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const dock = canvas.getByTestId('cue-proof-dock');
    const before = dock.getBoundingClientRect();

    await userEvent.click(canvas.getByRole('button', { name: 'Edit Cues' }));

    const after = dock.getBoundingClientRect();
    expect({
      x: after.x,
      y: after.y,
      width: after.width,
      height: after.height,
    }).toEqual({
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
    });
    expect(page.getByTestId('cue-editor-popover')).toBeVisible();
    expect(
      page.queryByRole('button', { name: /^(Play|Pause)/ })
    ).not.toBeInTheDocument();
  },
};
