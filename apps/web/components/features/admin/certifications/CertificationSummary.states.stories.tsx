import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fixtureRow } from '@/lib/ovie/certifications/fixtures';
import {
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import {
  CertificationEvidenceStrip,
  CertificationIdentity,
} from './CertificationSummary';

const row = fixtureRow('signup');

function withAllTiers(
  status: OvieCertificationRow['tiers'][keyof OvieCertificationRow['tiers']]
): OvieCertificationRow {
  return {
    ...row,
    tiers: Object.fromEntries(
      OVIE_CERTIFICATION_TIERS.map(tier => [tier, status])
    ) as OvieCertificationRow['tiers'],
  };
}

/** State coverage for the certification identity and evidence strip. */
const meta = {
  title: 'Features/Admin/Certifications/CertificationSummary States',
  component: CertificationIdentity,
  parameters: { layout: 'centered' },
  args: { row },
  render: ({ row: storyRow }) => (
    <div className='w-80 space-y-2 rounded-md border border-subtle bg-base p-4 text-primary-token'>
      <CertificationIdentity row={storyRow} />
      <CertificationEvidenceStrip row={storyRow} />
    </div>
  ),
} satisfies Meta<typeof CertificationIdentity>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no tier has landed evidence yet. */
export const EmptyEvidence: Story = {
  args: { row: withAllTiers('missing') },
};

/** Long content: a long subject title truncates beside the stale flag. */
export const LongContentTitle: Story = {
  args: {
    row: {
      ...row,
      staleFounderLock: true,
      subject: {
        ...row.subject,
        title:
          'Flow signup golden path through claim, onboarding chat, verification and the first paid plan',
      },
    },
  },
};

/** Right-to-left: identity and evidence inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    row: {
      ...row,
      subject: { ...row.subject, title: 'مسار التسجيل الذهبي' },
    },
  },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
