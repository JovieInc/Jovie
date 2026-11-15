import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fixtureInventory } from '@/lib/ovie/certifications/fixtures';
import { CertificationReviewCard } from './CertificationReviewCard';

const inventory = fixtureInventory();
const card = inventory.queue.needsYou[0]!.card!;
const LONG =
  'This deliberately long line explains why the decision matters now, which journey it unblocks and what changes for the founder, so the card can be checked for clean wrapping inside a narrow rail.';

/** State coverage for the certification review card. */
const meta = {
  title: 'Features/Admin/Certifications/CertificationReviewCard States',
  component: CertificationReviewCard,
  parameters: { layout: 'centered' },
  args: { row: inventory.rows[0]!, card },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <div className='w-80 rounded-md border border-subtle bg-base p-4 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof CertificationReviewCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no owner and no decision brief yet; evidence and link remain. */
export const EmptyBrief: Story = {
  args: { row: { ...inventory.rows[0]!, owner: null }, card: null },
};

/** Long content: every brief field runs to several lines. */
export const LongContentBrief: Story = {
  args: {
    row: {
      ...inventory.rows[0]!,
      owner: 'Design systems and certification working group',
      subject: {
        ...inventory.rows[0]!.subject,
        title:
          'Flow signup golden path through claim, onboarding chat, verification and the first paid plan',
      },
    },
    card: {
      ...card,
      whyNow: LONG,
      journey: LONG,
      unblocks: LONG,
      decision: LONG,
    },
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    card: { ...card, whyNow: 'القرار يفتح مسار التسجيل الآن.' },
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
