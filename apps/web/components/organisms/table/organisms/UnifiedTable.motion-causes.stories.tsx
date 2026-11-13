import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MotionGlobalConfig } from 'motion/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useLayoutEffect, useMemo, useState } from 'react';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceTable } from '@/components/features/dashboard/organisms/dsp-presence/DspPresenceTable';
import { ReleaseTable } from '@/components/features/dashboard/organisms/release-provider-matrix/ReleaseTable';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';
import { AppShellRightRail } from '@/components/shell/AppShellRightRail';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { UnifiedTable } from './UnifiedTable';

const presence: DspPresenceItem[] = Array.from({ length: 24 }, (_, index) => ({
  matchId: `match-${index}`,
  providerId: index % 2 ? 'spotify' : 'apple_music',
  status: 'confirmed',
  confidenceScore: 1,
  matchingIsrcCount: 12,
  matchSource: 'manual',
  confirmedAt: null,
  externalArtistName: `Artist ${index + 1}`,
  externalArtistUrl: null,
  externalArtistImageUrl: null,
  confidenceBreakdown: null,
}));

const releases: ReleaseViewModel[] = Array.from(
  { length: 24 },
  (_, index) =>
    ({
      profileId: 'profile-1',
      id: `release-${index}`,
      title: `Release ${index + 1}`,
      artistNames: ['Artist'],
      releaseDate: '2026-08-01',
      status: 'released',
      slug: `release-${index}`,
      smartLinkPath: `/release-${index}`,
      providers: [],
      releaseType: 'single',
      isExplicit: false,
      totalTracks: 1,
    }) as ReleaseViewModel
);

function PanelOutlet() {
  const panel = useRightPanel();
  return <AppShellRightRail>{panel}</AppShellRightRail>;
}

function SelectedRowDrawer({
  surface,
}: {
  readonly surface: 'presence' | 'releases';
}) {
  useLayoutEffect(() => {
    const previous = MotionGlobalConfig.skipAnimations;
    MotionGlobalConfig.skipAnimations = false;
    return () => {
      MotionGlobalConfig.skipAnimations = previous;
    };
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const select = (id: string) =>
    setSelected(current => (current === id ? null : id));
  const panel = useMemo(
    () =>
      selected === null ? null : (
        <RightDrawer
          isOpen
          width={420}
          ariaLabel='Selected row details'
          onKeyDown={event => {
            if (event.key === 'Escape') setSelected(null);
          }}
        >
          <div className='space-y-2 p-4'>
            <p>{selected}</p>
            <Button onClick={() => setSelected(null)}>Close inspector</Button>
          </div>
        </RightDrawer>
      ),
    [selected]
  );
  useRegisterRightPanel(panel);
  return (
    <NuqsTestingAdapter hasMemory>
      <div className='space-y-2'>
        <div className='flex gap-2'>
          <Button
            onClick={() =>
              select(surface === 'presence' ? 'match-0' : 'release-0')
            }
          >
            Toggle inspector
          </Button>
          <Button
            onClick={() =>
              setSelected(surface === 'presence' ? 'match-1' : 'release-1')
            }
          >
            Inspect second row
          </Button>
          <output aria-label='Selected row'>{selected ?? 'None'}</output>
        </div>
        <div
          className='@container flex h-96 min-w-0'
          data-testid='motion-shell'
        >
          <div
            className='min-w-0 flex-1 overflow-auto'
            data-testid='motion-table-plane'
          >
            {surface === 'presence' ? (
              <DspPresenceTable
                items={presence}
                selectedMatchId={selected}
                onRowSelect={item => select(item.matchId)}
              />
            ) : (
              <ReleaseTable
                releases={releases}
                providerConfig={{}}
                artistName='Artist'
                onCopy={async () => 'copied'}
                onEdit={release => select(release.id)}
                selectedReleaseId={selected}
              />
            )}
          </div>
          <PanelOutlet />
        </div>
      </div>
    </NuqsTestingAdapter>
  );
}

const meta = {
  title: 'Organisms/Table/MotionCauses',
  component: SelectedRowDrawer,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <RightPanelProvider>
        <Story />
      </RightPanelProvider>
    ),
  ],
} satisfies Meta<typeof SelectedRowDrawer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PresenceDrawer: Story = { args: { surface: 'presence' } };
export const ReleaseDrawer: Story = { args: { surface: 'releases' } };

function ColumnResizeFixture() {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const previous = MotionGlobalConfig.skipAnimations;
    MotionGlobalConfig.skipAnimations = false;
    return () => {
      MotionGlobalConfig.skipAnimations = previous;
    };
  }, []);
  return (
    <div className='w-full'>
      <Button onClick={() => setWide(value => !value)}>Resize column</Button>
      <UnifiedTable
        data={presence}
        columns={[
          {
            accessorKey: 'externalArtistName',
            header: 'Artist',
            size: wide ? 600 : 200,
            meta: { primary: true, minWidth: 200 },
          },
          {
            accessorKey: 'status',
            header: 'Status',
            size: 200,
            meta: { priority: 1, minWidth: 200 },
          },
        ]}
        columnSizing='schema'
        minWidth='0'
        enableVirtualization={false}
      />
    </div>
  );
}

export const ColumnResize: Story = { render: () => <ColumnResizeFixture /> };
