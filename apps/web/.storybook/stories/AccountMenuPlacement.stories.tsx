import { Button, CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { BookOpen, Keyboard, Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { createSignedInApiMock } from '@/.storybook/signed-in-session';
import { UserButton } from '@/components/organisms/user-button/UserButton';
import userButtonMeta, {
  MacAccountMenu,
} from '@/components/organisms/user-button/UserButton.stories';
import { KeyboardShortcutsProvider } from '@/contexts/KeyboardShortcutsContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';

interface Placement {
  anchor: 'left' | 'right' | 'top' | 'middle-right';
  documentDirection?: 'ltr' | 'rtl';
}

function PlacementFrame({
  children,
  placement,
}: {
  children: ReactNode;
  placement: Placement;
}) {
  const anchor =
    placement.anchor === 'middle-right'
      ? 'right-2 top-1/2'
      : placement.anchor === 'right'
        ? 'right-2 bottom-2'
        : placement.anchor === 'top'
          ? 'left-2 top-8'
          : 'left-2 bottom-2';
  return (
    <div
      data-account-placement-frame
      dir={placement.documentDirection ?? 'ltr'}
      className='min-h-screen bg-sidebar text-primary-token'
    >
      <div data-account-placement-anchor className={`fixed w-52 ${anchor}`}>
        {children}
      </div>
    </div>
  );
}

const meta: Meta<typeof UserButton> = {
  ...userButtonMeta,
  title: 'Organisms/UserButton/Placement',
  component: UserButton,
  args: { ...userButtonMeta.args, ...MacAccountMenu.args },
  parameters: {
    layout: 'fullscreen',
    themes: { themeOverride: 'dark' },
    placement: { anchor: 'left' },
  },
  beforeEach: async context => {
    const setup = MacAccountMenu.beforeEach;
    const setupHooks = Array.isArray(setup) ? setup : setup ? [setup] : [];
    const restores: (() => unknown)[] = [];
    for (const hook of setupHooks) {
      const restore = await hook(context);
      if (typeof restore === 'function') restores.push(restore);
    }
    const target = window as Window & {
      __jovieApiMock?: ReturnType<typeof createSignedInApiMock>;
    };
    const previous = target.__jovieApiMock;
    const previousDirection = document.documentElement.dir;
    document.documentElement.dir =
      context.parameters.placement?.documentDirection ?? 'ltr';
    const fictional = createSignedInApiMock({
      name: 'Casey Example',
      email: 'casey@example.test',
      username: 'casey-example',
    });
    target.__jovieApiMock = request =>
      fictional(request) ?? previous?.(request);
    return async () => {
      target.__jovieApiMock = previous;
      document.documentElement.dir = previousDirection;
      for (const restore of restores.toReversed()) await restore();
    };
  },
  decorators: [
    (Story, context) => (
      <JovieAuthValuesProvider>
        <KeyboardShortcutsProvider>
          <PlacementFrame placement={context.parameters.placement}>
            <Story />
          </PlacementFrame>
        </KeyboardShortcutsProvider>
      </JovieAuthValuesProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Left: Story = {};
export const Right: Story = { parameters: { placement: { anchor: 'right' } } };
export const VerticalCollision: Story = {
  parameters: { placement: { anchor: 'top' } },
};
/** DOM RTL alone does not provide Radix direction; that app seam is separate. */
export const AccountRtlDocument: Story = {
  parameters: {
    placement: { anchor: 'right', documentDirection: 'rtl' },
  },
};

const resources: CommonDropdownItem[] = [
  {
    type: 'submenu',
    id: 'resources',
    label: 'Resources',
    icon: BookOpen,
    items: [
      {
        type: 'action',
        id: 'shortcuts',
        label: 'Keyboard Shortcuts',
        icon: Keyboard,
        onClick: () => undefined,
      },
      {
        type: 'action',
        id: 'privacy',
        label: 'Privacy Guide',
        icon: Shield,
        onClick: () => undefined,
      },
    ],
  },
];

/** Real shared Radix renderer with its supported explicit RTL direction. */
export const SharedRtl: Story = {
  parameters: {
    placement: { anchor: 'middle-right', documentDirection: 'rtl' },
  },
  render: () => (
    <CommonDropdown
      dir='rtl'
      items={resources}
      trigger={<Button>Open resources</Button>}
    />
  ),
};
