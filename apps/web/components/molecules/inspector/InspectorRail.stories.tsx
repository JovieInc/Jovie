import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { EntityHeader } from '@/components/molecules/drawer';
import { InspectorShell } from './InspectorRail';
import { LIBRARY_INSPECTOR_TABS } from './inspector-tabs';

const meta = {
  title: 'Molecules/Inspector/InspectorShell',
  component: InspectorShell,
  args: {
    isOpen: true,
    ariaLabel: 'Release inspector',
    tabs: LIBRARY_INSPECTOR_TABS,
    activeTab: 'details' as const,
    onTabChange: fn(),
    tabsAriaLabel: 'Inspector tabs',
    objectHeader: <EntityHeader className='px-3 pt-3' title='Take Me Over' />,
    children: <p>Details body</p>,
    isLoading: false,
  },
  decorators: [
    Story => (
      <div
        className='flex min-h-0 justify-end'
        style={{ height: 'calc(100svh - 2rem)' }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InspectorShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};

export const Empty: Story = {
  args: { isEmpty: true },
};

export const Error: Story = {
  args: { children: <p role='alert'>Unable to load assets. Try again.</p> },
};

const FACTS = Array.from({ length: 50 }, (_, index) => `Fact ${index + 1}`);

function RefreshFixture() {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('details');
  return (
    <div className='flex min-h-0 flex-1 justify-end gap-3'>
      <div>
        <Button
          onMouseDown={event => event.preventDefault()}
          onClick={() => setLoading(value => !value)}
        >
          Toggle loading
        </Button>
        <Button onClick={() => setOpen(value => !value)}>Toggle rail</Button>
      </div>
      <InspectorShell
        isOpen={open}
        ariaLabel='Refresh inspector'
        objectHeader={
          <EntityHeader
            className='px-3 pt-3'
            title='A deliberately long release title with enough words to wrap'
            stableLayout
            titleLineClamp={1}
            reserveSubtitleSlot
            reserveMetaSlot
          />
        }
        tabs={LIBRARY_INSPECTOR_TABS}
        activeTab={tab}
        onTabChange={setTab}
        tabsAriaLabel='Inspector tabs'
        isLoading={loading}
        onKeyDown={event => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'r') {
            event.preventDefault();
            setLoading(value => !value);
          }
        }}
        onClose={() => setOpen(false)}
      >
        <input aria-label='Asset note' defaultValue='Unsaved note' />
        {FACTS.map(fact => (
          <p key={fact} className='py-2'>
            {fact}: {tab}
          </p>
        ))}
      </InspectorShell>
    </div>
  );
}

export const RefreshStability: Story = { render: () => <RefreshFixture /> };
