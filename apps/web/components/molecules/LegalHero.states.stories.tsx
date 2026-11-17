import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { LegalHero } from './LegalHero';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/LegalHero States',
  component: LegalHero,
  parameters: {
    layout: 'padded',
  },
  args: {
    title: 'Terms of Service',
    lastUpdated: 'September 1, 2026',
    practicalSummary:
      'The short version: use Jovie in good faith, keep your account secure, and we will keep the lights on.',
  },
} satisfies Meta<typeof LegalHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: an Arabic legal header inside an RTL document. */
export const RtlArabicHeader: Story = {
  args: {
    title: 'شروط الخدمة',
    lastUpdated: '١ سبتمبر ٢٠٢٦',
    practicalSummary:
      'باختصار: استخدم جوفي بحسن نية، وحافظ على أمان حسابك، وسنحافظ على استمرار الخدمة.',
  },
  decorators: [RtlFrame],
};
