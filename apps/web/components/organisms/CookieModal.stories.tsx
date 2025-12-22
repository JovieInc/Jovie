import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { CookieModal } from './CookieModal';

const meta: Meta<typeof CookieModal> = {
  title: 'Organisms/CookieModal',
  component: CookieModal,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CookieModal>;

export const Open: Story = {
  args: {
    open: true,
    onClose: () => console.log('Close'),
    onSave: consent => console.log('Saved:', consent),
  },
};

export const Interactive: Story = {
  render: function InteractiveCookieModal() {
    const [open, setOpen] = useState(false);

    return (
      <div>
        <Button onClick={() => setOpen(true)}>Manage Cookie Preferences</Button>
        <CookieModal
          open={open}
          onClose={() => setOpen(false)}
          onSave={consent => {
            console.log('Consent saved:', consent);
            setOpen(false);
          }}
        />
      </div>
    );
  },
};
