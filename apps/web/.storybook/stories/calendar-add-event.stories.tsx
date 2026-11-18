import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AddEventDialog } from '@/app/app/(shell)/calendar/AddEventDialog';

function CalendarToolbarFixture() {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <AddEventDialog
        profileId='profile-1'
        createEventAction={async () => ({ ok: true })}
      />
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Calendar/Add Event',
  component: CalendarToolbarFixture,
} satisfies Meta<typeof CalendarToolbarFixture>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
