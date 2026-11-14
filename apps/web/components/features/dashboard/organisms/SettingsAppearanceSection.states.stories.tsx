import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsAppearanceSection } from './SettingsAppearanceSection';

function buildDashboardData(withProfile: boolean): DashboardData {
  return {
    user: { id: 'user_123' },
    creatorProfiles: [],
    selectedProfile: withProfile ? { id: 'profile_123' } : null,
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin: false,
  } as unknown as DashboardData;
}

/** Replace the settings PUT (/api/dashboard/profile) for one story. */
function stubFetch(next: typeof globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = next;
  return () => {
    globalThis.fetch = original;
  };
}

function withData(withProfile: boolean, dir?: 'rtl') {
  return (Story: () => React.JSX.Element) => (
    <DashboardDataProvider value={buildDashboardData(withProfile)}>
      <TooltipProvider>
        <div className='max-w-3xl' dir={dir}>
          <Story />
        </div>
      </TooltipProvider>
    </DashboardDataProvider>
  );
}

async function pickDarkTheme(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('theme-option-dark'));
  return canvas;
}

/**
 * Appearance settings states. Saves go through PUT /api/dashboard/profile,
 * which each save story stubs before picking the Dark theme.
 */
const meta = {
  title: 'Dashboard/Settings/SettingsAppearanceSection States',
  component: SettingsAppearanceSection,
  parameters: { layout: 'padded' },
  decorators: [withData(true)],
} satisfies Meta<typeof SettingsAppearanceSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the theme save never settles, so the theme options stay disabled. */
export const LoadingThemeSave: Story = {
  beforeEach: () => stubFetch(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    const canvas = await pickDarkTheme(canvasElement);
    await waitFor(() =>
      expect(canvas.getByTestId('theme-option-light')).toBeDisabled()
    );
  },
};

/** Empty: no profile is selected, so every control is disabled. */
export const EmptyNoSelectedProfile: Story = {
  decorators: [withData(false)],
};

/** Error: the server refuses the theme save and the controls re-enable. */
export const ErrorThemeSaveRejected: Story = {
  beforeEach: () =>
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: 'Save failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
    ),
  play: async ({ canvasElement }) => {
    const canvas = await pickDarkTheme(canvasElement);
    await waitFor(() =>
      expect(canvas.getByTestId('theme-option-light')).toBeEnabled()
    );
  },
};

/** Offline: the theme save fails at the network and the controls re-enable. */
export const OfflineThemeSaveFailed: Story = {
  beforeEach: () =>
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    }),
  play: async ({ canvasElement }) => {
    const canvas = await pickDarkTheme(canvasElement);
    await waitFor(() =>
      expect(canvas.getByTestId('theme-option-light')).toBeEnabled()
    );
  },
};

/** Right-to-left: the theme grid and contrast toggle inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [withData(true, 'rtl')],
};
