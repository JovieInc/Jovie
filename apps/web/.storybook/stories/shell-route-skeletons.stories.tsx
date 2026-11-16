import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { CalendarRouteSkeleton } from '@/app/app/(shell)/calendar/CalendarRouteSkeleton';
import { LinksRouteSkeleton } from '@/app/app/(shell)/links/LinksRouteSkeleton';
import { ProfilesRouteSkeleton } from '@/app/app/(shell)/profiles/ProfilesRouteSkeleton';
import { SettingsRouteSkeleton } from '@/app/app/(shell)/settings/SettingsRouteSkeleton';
import { TourDatesRouteSkeleton } from '@/app/app/(shell)/tour-dates/TourDatesRouteSkeleton';

/**
 * First-boot route skeletons (page-skeletons Pen brief). Each one fills the
 * shell content canvas with its page's frame, toolbar and header geometry.
 */
function ShellCanvas({ children }: { readonly children: ReactNode }) {
  return (
    <div className='relative flex h-[720px] w-full flex-col overflow-hidden bg-(--app-shell-content-surface)'>
      {children}
    </div>
  );
}

const meta = {
  title: 'Shell/Route Skeletons',
  component: ShellCanvas,
  parameters: { layout: 'fullscreen' },
  args: { children: null },
} satisfies Meta<typeof ShellCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Calendar: Story = {
  args: { children: <CalendarRouteSkeleton /> },
};

export const Links: Story = {
  args: { children: <LinksRouteSkeleton /> },
};

export const Profiles: Story = {
  args: { children: <ProfilesRouteSkeleton /> },
};

export const TourDates: Story = {
  args: { children: <TourDatesRouteSkeleton /> },
};

export const Settings: Story = {
  args: { children: <SettingsRouteSkeleton /> },
};
