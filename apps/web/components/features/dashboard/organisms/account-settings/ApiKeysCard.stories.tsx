import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { ApiKeysCard } from './ApiKeysCard';

type Mode = 'ready' | 'empty' | 'loading' | 'error';
type MockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};
function KeyFixture({
  mode,
  children,
}: {
  readonly mode: Mode;
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => {
    const host = window as MockWindow;
    const previous = host.__jovieApiMock;
    let keys =
      mode === 'empty'
        ? []
        : [{ id: 'fixture-key', name: 'Build agent', start: 'jovie_demo' }];
    host.__jovieApiMock = ({ url }) => {
      if (!url.pathname.startsWith('/api/auth/api-key/')) return undefined;
      if (mode === 'loading') return new Promise<Response>(() => undefined);
      if (mode === 'error')
        return Response.json({ message: 'Unavailable' }, { status: 503 });
      if (url.pathname.endsWith('/create')) {
        keys = [
          { id: 'fixture-key', name: 'Build agent', start: 'jovie_demo' },
        ];
        return Response.json({
          id: 'fixture-key',
          key: 'jovie_' + 'x'.repeat(64),
        });
      }
      if (url.pathname.endsWith('/delete')) {
        keys = [];
        return Response.json({ success: true });
      }
      return Response.json({ apiKeys: keys, total: keys.length });
    };
    return () => {
      host.__jovieApiMock = previous;
    };
  }, [mode]);
  return (
    <div className='max-w-2xl'>
      <SettingsPanel>{children}</SettingsPanel>
    </div>
  );
}
const meta = {
  title: 'Dashboard/Organisms/AccountSettings/ApiKeysCard',
  component: ApiKeysCard,
  args: { userId: 'synthetic-user' },
  parameters: { layout: 'padded', keyState: 'ready' },
  decorators: [
    (Story, context) => (
      <KeyFixture mode={context.parameters.keyState}>
        <Story />
      </KeyFixture>
    ),
  ],
} satisfies Meta<typeof ApiKeysCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Empty: Story = { parameters: { keyState: 'empty' } };
export const Error: Story = { parameters: { keyState: 'error' } };
export const Loading: Story = { parameters: { keyState: 'loading' } };
