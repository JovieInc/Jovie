import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { Banner } from './Banner';
import { toast } from './toast';

function FeedbackFamilies() {
  return (
    <div className='flex w-full max-w-xl flex-col gap-4 p-6'>
      <Banner
        title='Catalog import complete'
        description='All releases are ready to review.'
        variant='success'
        action={{ label: 'Review', onClick: fn() }}
        onDismiss={fn()}
      />
      <div>
        <Button type='button' onClick={() => toast.success('Changes saved')}>
          Show Toast
        </Button>
      </div>
    </div>
  );
}

const meta = {
  title: 'Feedback/CanonicalFamilies',
  component: FeedbackFamilies,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof FeedbackFamilies>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BannerAndToast: Story = {};
