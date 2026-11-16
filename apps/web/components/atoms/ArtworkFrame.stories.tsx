import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTWORK_FIT_CLASSNAME, ArtworkFrame } from './ArtworkFrame';

const meta = {
  title: 'Atoms/ArtworkFrame',
  component: ArtworkFrame,
  parameters: { layout: 'centered' },
  args: {
    size: 145,
    className: 'h-[145px] w-[145px] bg-surface-2',
    children: (
      <img
        alt='Never Say A Word artwork'
        className={`h-full w-full ${ARTWORK_FIT_CLASSNAME}`}
        src='https://placehold.co/640x640/111827/E5E7EB?text=Artwork'
      />
    ),
  },
} satisfies Meta<typeof ArtworkFrame>;

export default meta;
export const Default: StoryObj<typeof meta> = {};

/** A thumbnail frame leading a right-to-left release row keeps its square size. */
export const Rtl: StoryObj<typeof meta> = {
  render: () => (
    <div dir='rtl' className='flex w-64 items-center gap-3'>
      <ArtworkFrame size='thumbnail' className='h-10 w-10 bg-surface-2'>
        <span aria-hidden='true' className='block h-full w-full' />
      </ArtworkFrame>
      <span className='min-w-0 truncate text-sm text-primary-token'>
        لا تقل كلمة · النسخة الموسعة للنادي
      </span>
    </div>
  ),
};
