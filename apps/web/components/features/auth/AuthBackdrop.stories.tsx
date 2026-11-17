import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBackdrop } from './AuthBackdrop';

const meta: Meta<typeof AuthBackdrop> = {
  title: 'Auth/AuthBackdrop',
  component: AuthBackdrop,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof AuthBackdrop>;

const Canvas = ({
  children,
  dir,
}: {
  readonly children: React.ReactNode;
  readonly dir?: 'rtl';
}) => (
  <div
    dir={dir}
    className='relative isolate grid min-h-dvh place-items-center bg-(--color-bg-base) p-6 text-primary-token'
  >
    <AuthBackdrop />
    {children}
  </div>
);

export const Default: Story = {
  render: () => (
    <Canvas>
      <p className='text-xl font-semibold'>Log in to Jovie</p>
    </Canvas>
  ),
};

/** Long content: the backdrop stays fixed behind a column taller than the viewport. */
export const LongContent: Story = {
  render: () => (
    <Canvas>
      <div className='max-w-sm space-y-4'>
        {Array.from({ length: 24 }, (_, index) => (
          <p key={index} className='text-sm text-secondary-token'>
            A long sign-in column scrolls over the glow without moving it.
          </p>
        ))}
      </div>
    </Canvas>
  ),
};

/** RTL: the glow is decorative and keeps Pen's placement in either direction. */
export const Rtl: Story = {
  render: () => (
    <Canvas dir='rtl'>
      <p lang='ar' className='text-xl font-semibold'>
        تسجيل الدخول إلى Jovie
      </p>
    </Canvas>
  ),
};
