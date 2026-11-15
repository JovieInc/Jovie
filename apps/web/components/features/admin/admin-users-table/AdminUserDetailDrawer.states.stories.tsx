import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AdminUserDetailDrawer } from './AdminUserDetailDrawer';
import { adminUser, longContentUser, rtlUser } from './adminUser.test-fixtures';

const withRailFrame: Decorator = function RailFrameDecorator(Story) {
  return (
    <div className='flex h-screen min-h-0 justify-end'>
      <Story />
    </div>
  );
};

const withRtlDirection: Decorator = function RtlDirectionDecorator(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Admin/AdminUserDetailDrawer States',
  component: AdminUserDetailDrawer,
  decorators: [withRailFrame],
  args: {
    user: adminUser,
    onClose: fn(),
  },
} satisfies Meta<typeof AdminUserDetailDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long names, emails, ids and many links must clamp or truncate cleanly. */
export const LongContent: Story = {
  args: { user: longContentUser },
  play: async ({ canvasElement }) => {
    // TEMP CI DEBUG — reverted before merge: dump the header geometry that
    // drives the axe target-size overlap between Copy Email and Close.
    const r = (el: Element | null | undefined) =>
      el ? JSON.stringify(el.getBoundingClientRect()) : 'null';
    const copy = canvasElement.querySelector('button[aria-label="Copy Email"]');
    const close = canvasElement.querySelector(
      '[data-testid="drawer-card-close-trigger"]'
    );
    const stackAt = (x: number, y: number) =>
      JSON.stringify(
        document
          .elementsFromPoint(x, y)
          .map(e => `${e.tagName}:${String(e.className).slice(0, 60)}`)
      );
    console.log('A11YDBG viewport', window.innerWidth, window.innerHeight);
    console.log('A11YDBG copy', r(copy));
    console.log('A11YDBG close', r(close));
    if (copy) {
      const cr = copy.getBoundingClientRect();
      console.log(
        'A11YDBG stack-copy-top',
        stackAt(cr.x + cr.width / 2, cr.y + 4)
      );
    }
    if (close) {
      const kr = close.getBoundingClientRect();
      console.log(
        'A11YDBG stack-close-right',
        stackAt(kr.x + kr.width - 4, kr.y + kr.height / 2)
      );
    }
    console.log(
      'A11YDBG eh',
      r(canvasElement.querySelector('[data-testid="entity-header"]'))
    );
    console.log(
      'A11YDBG slot',
      r(
        canvasElement.querySelector('[data-testid="entity-header-details-row"]')
      )
    );
    console.log(
      'A11YDBG bar',
      r(canvasElement.querySelector('[data-testid="drawer-card-action-bar"]'))
    );
    console.log(
      'A11YDBG rail',
      r(
        canvasElement.querySelector('aside') ??
          document.querySelector('section[role="dialog"]')
      )
    );
  },
};

/** Right-to-left document with an Arabic user name and link label. */
export const Rtl: Story = {
  decorators: [withRtlDirection],
  args: { user: rtlUser },
};
