import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useCallback, useState } from 'react';
import { fn } from 'storybook/test';
import { ArtworkFrame } from '@/components/atoms/ArtworkFrame';
import { UnifiedTable } from '@/components/organisms/table';
import {
  applyCacheScope,
  getCacheGeneration,
  getCacheScope,
} from '@/lib/queries/cache-isolation';
import type { CellContext, ColumnDef } from '@/lib/tanstack-table';
import {
  type ArrivalProjection,
  type ArrivalRowsPresentation,
  LibraryFirstArrivalAdapter,
  useLibraryFirstArrivalActions,
} from './LibraryFirstArrivalAdapter';

const scope = {
  userId: 'arrival-story-user',
  tenantId: 'arrival-story-tenant',
  identityId: 'source-artist',
};
const context = () => ({
  userId: scope.userId,
  profileId: 'arrival-story-profile',
  sessionId: 'arrival-story-session',
  impersonationSubject: null,
  generation: getCacheGeneration(),
});
type FixtureState =
  | 'unknown'
  | 'preview'
  | 'partial'
  | 'failed'
  | 'reconnect'
  | 'seen'
  | 'no-port';
/** Synthetic projections emitted by reviewed core2933dc98. Not live eligibility or persistence. */
function projection(kind: FixtureState): ArrivalProjection {
  const preview = kind === 'preview';
  return {
    context: context(),
    state: {
      scope,
      activeRun: preview ? null : 'synthetic-import-run',
      revision: preview ? -1 : 1,
      importedIds: preview ? [] : ['release-1', 'release-2'],
    },
    view: {
      showIntroduction:
        kind === 'partial' || kind === 'failed' || kind === 'no-port',
      availableCount: preview ? 0 : 2,
      source: preview ? null : 'spotify',
      scopeComplete: false,
      fullCatalogComplete: false,
      status: preview ? 'pending' : kind === 'failed' ? 'failed' : 'partial',
      metric: null,
      motionIds: [],
      interactionBlocked: false,
    },
  };
}
interface StoryRelease {
  id: string;
  title: string;
  type: string;
}
const records: StoryRelease[] = [
  { id: 'release-1', title: 'Morning Light', type: 'Single' },
  { id: 'release-2', title: 'After The Rain', type: 'EP' },
];
function TitleCell({ row }: CellContext<StoryRelease, unknown>) {
  const { onCommittedRow } = useLibraryFirstArrivalActions();
  const attach = useCallback(
    (node: HTMLDivElement | null) => onCommittedRow(row.original.id, node),
    [onCommittedRow, row.original.id]
  );
  return (
    <div ref={attach} className='flex min-w-0 items-center gap-2'>
      <ArtworkFrame
        size={24}
        className='flex h-6 w-6 items-center justify-center bg-surface-1 text-tertiary-token'
      >
        <span aria-hidden>♪</span>
      </ArtworkFrame>
      <span className='truncate'>{row.original.title}</span>
    </div>
  );
}
const columns: ColumnDef<StoryRelease, unknown>[] = [
  { accessorKey: 'title', header: 'Title', cell: TitleCell, size: 320 },
  { accessorKey: 'type', header: 'Type', size: 120 },
];
function CanonicalRows({
  presentation,
  empty,
}: {
  presentation: ArrivalRowsPresentation;
  empty: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { skipButtonProps } = useLibraryFirstArrivalActions();
  return (
    <>
      <div className='flex h-8 items-center justify-between border-b border-subtle px-3 text-xs text-secondary-token'>
        <span>
          {presentation.showIntroduction ? 'New work is available' : 'Library'}
        </span>
        {presentation.showIntroduction ? (
          <Button size='sm' variant='ghost' {...skipButtonProps}>
            Skip introduction
          </Button>
        ) : null}
      </div>
      <UnifiedTable
        data={empty ? [] : records}
        columns={columns}
        getRowId={row => row.id}
        enableVirtualization={false}
        rowMode='dense'
        minWidth='0'
        onRowClick={row => setSelected(row.id)}
        isRowSelected={row => row.id === selected}
      />
      <output className='sr-only' aria-label='Selected release'>
        {selected ?? 'None'}
      </output>
    </>
  );
}
function ArrivalStory({ state }: { state: FixtureState }) {
  return (
    <div className='flex min-h-96 w-full flex-col bg-base text-primary-token'>
      <LibraryFirstArrivalAdapter
        scope={scope}
        context={context()}
        projection={projection(state)}
        onEvent={state === 'no-port' ? undefined : fn()}
      >
        {presentation => (
          <CanonicalRows
            presentation={presentation}
            empty={state === 'preview'}
          />
        )}
      </LibraryFirstArrivalAdapter>
    </div>
  );
}
const meta = {
  title: 'Library/FirstArrivalAdapter',
  component: ArrivalStory,
  args: { state: 'unknown' },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Private synthetic projection evidence, not production/Pen fidelity or live eligibility. Motion remains unapproved. Story event ports only log; the separate private harness wires the unchanged real reducer and observes its effects.',
      },
    },
  },
  beforeEach: () => {
    const previous = getCacheScope();
    applyCacheScope({
      userId: scope.userId,
      profileId: 'arrival-story-profile',
      sessionId: 'arrival-story-session',
      impersonationSubject: null,
      ready: true,
    });
    return () => {
      applyCacheScope(previous);
    };
  },
} satisfies Meta<typeof ArrivalStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UnknownEligibility: Story = {};
export const SourcePreviewOnly: Story = { args: { state: 'preview' } };
export const CommittedPartial: Story = { args: { state: 'partial' } };
export const FailedWithRows: Story = { args: { state: 'failed' } };
export const ReconnectedStatic: Story = { args: { state: 'reconnect' } };
export const AlreadySeen: Story = { args: { state: 'seen' } };
export const MissingEffectPort: Story = { args: { state: 'no-port' } };
