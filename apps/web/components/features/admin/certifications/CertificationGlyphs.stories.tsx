import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  OVIE_CERTIFICATION_STATE_LABELS,
  OVIE_CERTIFICATION_STATES,
  OVIE_CERTIFICATION_TIER_LABELS,
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationTierStatus,
} from '@/lib/ovie/certifications/types';
import {
  CertificationStateGlyph,
  CertificationTierGlyph,
} from './CertificationGlyphs';

const TIER_STATUSES: readonly OvieCertificationTierStatus[] = [
  'passed',
  'failed',
  'pending',
  'missing',
];

const meta = {
  title: 'Features/Admin/Certifications/CertificationGlyphs',
  component: CertificationStateGlyph,
  parameters: { layout: 'centered' },
  args: { state: 'review_ready' },
} satisfies Meta<typeof CertificationStateGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const State: Story = {};

export const StateMatrix: Story = {
  render: () => (
    <div className='grid gap-3 rounded-md border border-subtle bg-base p-4 text-primary-token'>
      {OVIE_CERTIFICATION_STATES.map(state => (
        <div key={state} className='flex items-center gap-2 text-xs'>
          <CertificationStateGlyph state={state} />
          <span>{OVIE_CERTIFICATION_STATE_LABELS[state]}</span>
        </div>
      ))}
    </div>
  ),
};

export const EvidenceMatrix: Story = {
  render: () => (
    <div className='grid grid-cols-5 gap-x-4 gap-y-2 rounded-md border border-subtle bg-base p-4 text-xs text-primary-token'>
      <span />
      {TIER_STATUSES.map(status => (
        <span key={status} className='capitalize text-tertiary-token'>
          {status}
        </span>
      ))}
      {OVIE_CERTIFICATION_TIERS.map(tier => (
        <div key={tier} className='contents'>
          <span>{OVIE_CERTIFICATION_TIER_LABELS[tier]}</span>
          {TIER_STATUSES.map(status => (
            <span key={status} className='flex justify-center'>
              <CertificationTierGlyph tier={tier} status={status} />
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
};
