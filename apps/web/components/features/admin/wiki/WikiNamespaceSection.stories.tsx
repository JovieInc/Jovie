import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { WikiNamespaceSection } from './WikiNamespaceSection';

const meta = {
  title: 'Features/Admin/WikiNamespaceSection',
  component: WikiNamespaceSection,
  parameters: {
    layout: 'padded',
  },
  args: {
    group: {
      namespace: 'ops',
      pages: [
        { slug: 'ops/runbook', title: 'Runbook' },
        { slug: 'ops/on-call', title: '' },
        { slug: 'ops/deploys', title: 'Deploy checklist' },
      ],
    },
  },
} satisfies Meta<typeof WikiNamespaceSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: a namespace with no pages renders its heading over an empty list. */
export const EmptyNamespace: Story = {
  args: { group: { namespace: 'drafts', pages: [] } },
};

/** Long content: a long namespace and page titles that must wrap. */
export const LongContentTitles: Story = {
  args: {
    group: {
      namespace: 'engineering/platform/release-infrastructure',
      pages: [
        {
          slug: 'engineering/platform/release-infrastructure/rollback',
          title:
            'Rolling back a production release when the canary fails its health checks after promotion',
        },
        ...Array.from({ length: 12 }, (_, index) => ({
          slug: `engineering/platform/release-infrastructure/page-${index + 1}`,
          title: `Release infrastructure note ${index + 1}`,
        })),
      ],
    },
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: an Arabic namespace and titles in a right-to-left container. */
export const RtlNamespace: Story = {
  decorators: [withRtl],
  args: {
    group: {
      namespace: 'العمليات',
      pages: [
        { slug: 'العمليات/دليل-التشغيل', title: 'دليل التشغيل للفريق المناوب' },
        { slug: 'العمليات/النشر', title: '' },
      ],
    },
  },
};
