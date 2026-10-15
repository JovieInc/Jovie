import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { useEffect, useState } from 'react';
import { InlinePalette } from '@/components/organisms/SharedCommandPalette';
import { useSequentialShortcuts } from '@/hooks/useSequentialShortcuts';
import { commandsForSurface } from '@/lib/commands/registry';

function ScopedNavigationExample() {
  const [destination, setDestination] = useState('No navigation');
  useSequentialShortcuts();
  useEffect(() => {
    const push = getRouter().push;
    push.mockImplementation(href => setDestination(href));
    return () => {
      push.mockReset();
    };
  }, []);
  const work = commandsForSurface('cmdk').find(
    command => command.id === 'go-work'
  );
  if (work?.kind !== 'nav') throw new Error('Work command missing');
  return (
    <main className='w-full max-w-xl space-y-4 p-6'>
      <InlinePalette
        variant='inline'
        sections={[
          { id: 'nav', label: 'Go To', items: [{ kind: 'nav', nav: work }] },
        ]}
        selectedIndex={0}
        setSelectedIndex={() => undefined}
        onCommit={() => getRouter().push(work.href)}
      />
      <label className='block text-sm'>
        Unsent notes
        <textarea
          defaultValue='Unsent release notes'
          className='block w-full bg-surface-1 text-primary-token'
        />
      </label>
      <output aria-label='Navigation target'>{destination}</output>
    </main>
  );
}

const meta = {
  title: 'Hooks/Sequential Shortcuts',
  component: ScopedNavigationExample,
  parameters: { layout: 'centered', nextjs: { appDirectory: true } },
} satisfies Meta<typeof ScopedNavigationExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ScopedNavigation: Story = {};
