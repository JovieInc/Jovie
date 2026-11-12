import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import { resolveShellRouteSkeleton } from './shell-route-skeleton';

/** The resolver as the shell layout's Suspense fallback uses it: the
 * route-shaped main slot for the first signed-in boot of `pathname`. */
function ShellRouteSkeletonSlot({ pathname }: { readonly pathname: string }) {
  return (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      {resolveShellRouteSkeleton(pathname)}
    </div>
  );
}

const meta = {
  title: 'App/Shell/Route Skeleton',
  component: ShellRouteSkeletonSlot,
  parameters: { layout: 'fullscreen' },
  args: { pathname: APP_ROUTES.CHAT },
} satisfies Meta<typeof ShellRouteSkeletonSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingChat: Story = {};

export const LoadingLibrary: Story = {
  args: { pathname: APP_ROUTES.LIBRARY },
};

export const LoadingReleases: Story = {
  args: { pathname: APP_ROUTES.RELEASES },
};

export const LoadingCalendar: Story = {
  args: { pathname: APP_ROUTES.CALENDAR },
};

export const LoadingLinks: Story = {
  args: { pathname: APP_ROUTES.LINKS },
};

export const LoadingSettings: Story = {
  args: { pathname: APP_ROUTES.SETTINGS_ACCOUNT },
};

export const LoadingSettingsNarrow: Story = {
  args: { pathname: APP_ROUTES.SETTINGS_ACCOUNT },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
