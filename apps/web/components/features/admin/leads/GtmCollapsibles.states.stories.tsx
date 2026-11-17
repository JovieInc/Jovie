import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GtmCollapsibles } from './GtmCollapsibles';

const SETTINGS_PATH = '/api/admin/leads/settings';

/** The status panel's settings read never answers; nothing reaches the API. */
function holdSettings() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), window.location.href);
    if (url.pathname === SETTINGS_PATH) return new Promise<Response>(() => {});
    return originalFetch(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta = {
  title: 'Features/Admin/Leads/GtmCollapsibles States',
  component: GtmCollapsibles,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['title', 'isOpen', 'onToggle'] },
  },
  beforeEach: holdSettings,
} satisfies Meta<typeof GtmCollapsibles>;

export default meta;
type Story = StoryObj<typeof meta>;

function RtlCollapsibles(args: { readonly initialOpen?: string }) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-2xl'>
      <GtmCollapsibles {...args} />
    </div>
  );
}

/** RTL: the three section toggles mirror, with every section closed. */
export const RtlSectionsClosed: Story = { render: RtlCollapsibles };
