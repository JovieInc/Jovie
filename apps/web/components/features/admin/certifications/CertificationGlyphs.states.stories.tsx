import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationTierStatus,
} from '@/lib/ovie/certifications/types';
import {
  CertificationStateGlyph,
  CertificationTierGlyph,
} from './CertificationGlyphs';

/** State coverage for the certification glyphs. */
const meta = {
  title: 'Features/Admin/Certifications/CertificationGlyphs States',
  component: CertificationStateGlyph,
  parameters: { layout: 'centered' },
  args: { state: 'working' },
} satisfies Meta<typeof CertificationStateGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

function TierRow({
  statuses,
}: Readonly<{ statuses: readonly OvieCertificationTierStatus[] }>) {
  return (
    <div className='flex items-center gap-1 rounded-md border border-subtle bg-base p-4'>
      {OVIE_CERTIFICATION_TIERS.map((tier, index) => (
        <CertificationTierGlyph
          key={tier}
          tier={tier}
          status={statuses[index % statuses.length]!}
        />
      ))}
    </div>
  );
}

/** Pending: evidence that is still being gathered (half-filled glyph). */
export const PendingTierEvidence: Story = {
  render: () => <TierRow statuses={['pending']} />,
};

/** Partial: some tiers passed, others failed, pending or missing. */
export const PartialEvidence: Story = {
  render: function PartialEvidenceRender() {
    return (
      <TierRow
        statuses={['passed', 'passed', 'failed', 'pending', 'missing']}
      />
    );
  },
};

/** Right-to-left: state and tier glyphs inside an RTL document. */
export const RtlDocument: Story = {
  render: function RtlDocumentRender() {
    return (
      <div dir='rtl' className='flex items-center gap-2'>
        <CertificationStateGlyph state='review_ready' />
        <TierRow statuses={['passed', 'failed']} />
      </div>
    );
  },
};
