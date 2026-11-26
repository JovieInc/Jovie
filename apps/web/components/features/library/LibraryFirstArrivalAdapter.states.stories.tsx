import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import {
  applyCacheScope,
  getCacheGeneration,
  getCacheScope,
} from '@/lib/queries/cache-isolation';
import {
  type ArrivalProjection,
  LibraryFirstArrivalAdapter,
} from './LibraryFirstArrivalAdapter';

const scope = {
  userId: 'arrival-states-user',
  tenantId: 'arrival-states-tenant',
  identityId: 'source-artist',
};

function projection(
  status: 'pending' | 'partial',
  importedIds: readonly string[]
): ArrivalProjection {
  return {
    context: {
      userId: scope.userId,
      profileId: 'arrival-states-profile',
      sessionId: 'arrival-states-session',
      impersonationSubject: null,
      generation: getCacheGeneration(),
    },
    state: {
      scope,
      activeRun: status === 'pending' ? null : 'synthetic-import-run',
      revision: status === 'pending' ? -1 : 1,
      importedIds,
    },
    view: {
      showIntroduction: status === 'partial',
      availableCount: importedIds.length,
      source: status === 'pending' ? null : 'spotify',
      scopeComplete: false,
      fullCatalogComplete: false,
      status,
      metric: null,
      motionIds: [],
      interactionBlocked: false,
    },
  };
}

interface RowsStoryProps {
  readonly titles: readonly string[];
  readonly status?: 'pending' | 'partial';
  readonly hasEventPort?: boolean;
  readonly emptyLabel?: string;
}

function RowsStory({
  titles,
  status = 'partial',
  hasEventPort = true,
  emptyLabel = 'No releases yet',
}: RowsStoryProps) {
  return (
    <div className='flex min-h-48 w-full max-w-md flex-col bg-base p-4 text-primary-token'>
      <LibraryFirstArrivalAdapter
        scope={scope}
        context={{
          userId: scope.userId,
          profileId: 'arrival-states-profile',
          sessionId: 'arrival-states-session',
          impersonationSubject: null,
          generation: getCacheGeneration(),
        }}
        projection={projection(status, titles.map(String))}
        onEvent={hasEventPort ? fn() : undefined}
      >
        {presentation => (
          <ul className='space-y-1 text-sm'>
            <li className='text-xs text-secondary-token'>
              {presentation.showIntroduction
                ? 'New work is available'
                : 'Library'}
            </li>
            {titles.length === 0 ? (
              <li className='text-secondary-token'>{emptyLabel}</li>
            ) : (
              titles.map(title => (
                <li key={title} className='truncate'>
                  {title}
                </li>
              ))
            )}
          </ul>
        )}
      </LibraryFirstArrivalAdapter>
    </div>
  );
}

const meta = {
  title: 'Library/FirstArrivalAdapter States',
  component: RowsStory,
  args: { titles: ['Morning Light', 'After The Rain'] },
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const previous = getCacheScope();
    applyCacheScope({
      userId: scope.userId,
      profileId: 'arrival-states-profile',
      sessionId: 'arrival-states-session',
      impersonationSubject: null,
      ready: true,
    });
    return () => {
      applyCacheScope(previous);
    };
  },
} satisfies Meta<typeof RowsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the import has not produced a committed row yet. */
export const LoadingPending: Story = {
  args: { titles: [], status: 'pending', emptyLabel: 'Loading releases' },
};

/** Empty: nothing imported, so the rows render their own empty copy. */
export const EmptyLibrary: Story = {
  args: { titles: [] },
};

/** Long content: a very long release title truncates inside its row. */
export const LongContentTitle: Story = {
  args: {
    titles: [
      'An Extraordinarily Long Release Title That Keeps Going Well Past The Edge Of The Row To Prove Truncation',
    ],
  },
};

/** Offline: the effect port is missing, so rows stay static and usable. */
export const OfflineNoEventPort: Story = {
  args: { hasEventPort: false },
};

/** Right-to-left: Arabic release titles in a right-to-left row. */
export const RtlTitles: Story = {
  args: { titles: ['ضوء الصباح', 'بعد المطر'] },
  decorators: [
    (Story: () => React.JSX.Element) => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
