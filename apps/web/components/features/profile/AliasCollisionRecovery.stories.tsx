import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, waitFor } from 'storybook/test';
import { AliasCollisionRecovery } from './AliasCollisionRecovery';

const decideAlias = fn(async () => Response.json({ action: 'stay' }));

const meta = {
  title: 'Profile/AliasCollisionRecovery',
  component: AliasCollisionRecovery,
  parameters: { layout: 'centered' },
  args: {
    username: 'dualipa',
  },
} satisfies Meta<typeof AliasCollisionRecovery>;

export default meta;

export const AfterAliasRedirect: StoryObj<typeof AliasCollisionRecovery> = {
  beforeEach: () => {
    const previousFetch = globalThis.fetch;
    const previousUrl = window.location.href;
    decideAlias.mockClear();
    globalThis.fetch = decideAlias;
    const url = new URL(previousUrl);
    url.hash = 'alias=listen';
    window.history.replaceState(window.history.state, '', url);
    return () => {
      globalThis.fetch = previousFetch;
      window.history.replaceState(window.history.state, '', previousUrl);
    };
  },
  render: args => (
    <div className='min-h-40 bg-base p-8 text-primary-token'>
      <p className='text-sm'>
        Recovery mounts with no visible chrome. It reads #alias= after the edge
        redirect for <span className='font-medium'>{args.username}</span>.
      </p>
      <AliasCollisionRecovery {...args} />
    </div>
  ),
  play: async ({ args }) => {
    await waitFor(() => {
      expect(decideAlias).toHaveBeenCalledWith(
        `/api/profile-alias-decision/${args.username}/listen`,
        {
          headers: { accept: 'application/json' },
          signal: expect.any(AbortSignal),
        }
      );
      expect(window.location.hash).toBe('');
    });
  },
};
