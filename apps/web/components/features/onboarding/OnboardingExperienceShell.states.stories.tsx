import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingExperienceShell } from './OnboardingExperienceShell';

function PartialStage() {
  return (
    <div className='space-y-2'>
      <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
        Claim your handle
      </h1>
      <p className='text-sm text-secondary-token'>
        Only the stage is rendered. No sidebar, top bar or footer.
      </p>
    </div>
  );
}

function RtlStage() {
  return (
    <div className='space-y-2'>
      <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
        اختر اسم المستخدم الخاص بك
      </h1>
      <p className='text-sm text-secondary-token'>
        يظهر الإعداد من اليمين إلى اليسار مع الحفاظ على تباعد المرحلة.
      </p>
    </div>
  );
}

function RtlFrame({ children }: { readonly children: React.ReactNode }) {
  return (
    <div dir='rtl' lang='ar'>
      {children}
    </div>
  );
}

const meta = {
  title: 'Onboarding/ExperienceShell/States',
  component: OnboardingExperienceShell,
  parameters: { layout: 'fullscreen' },
  args: { mode: 'embedded', children: <PartialStage /> },
} satisfies Meta<typeof OnboardingExperienceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the stage alone, with every optional region omitted. */
export const PartialStageOnly: Story = {
  args: { stageVariant: 'flat' },
};

/** Right to left: the sidebar and stage mirror under an Arabic direction. */
export const RtlOverflow: Story = {
  args: {
    sidebarTitle: 'إعداد جووي',
    sidebar: <p className='text-sm text-secondary-token'>الخطوة الأولى</p>,
    children: <RtlStage />,
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <RtlFrame>
          <Story />
        </RtlFrame>
      );
    },
  ],
};
