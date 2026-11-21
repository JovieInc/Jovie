import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { terminalCtaStoryParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MarketingTerminalCta } from './MarketingTerminalCta';

/** Content states of the terminal CTA. The canonical variants live in MarketingTerminalCta.stories.tsx. */
const meta = {
  title: 'Site/MarketingTerminalCta/States',
  component: MarketingTerminalCta,
  parameters: terminalCtaStoryParameters,
  args: {
    title: 'A shared terminal call to action.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
    testId: 'storybook-marketing-terminal-cta-state',
    penContractId: MARKETING_PEN_CONTRACT_IDS.shell.finalCta,
  },
} satisfies Meta<typeof MarketingTerminalCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partial: Story = {
  args: { variant: 'cinematic' },
};

export const LongContent: Story = {
  args: {
    title:
      'A terminal call to action with an exceptionally long headline that has to wrap cleanly across several lines',
    body: 'One adaptive profile for every drop, every platform and every fan, with copy long enough to prove the body wraps without pushing the actions out of the section.',
    secondaryLabel: 'Talk to the team about a custom rollout',
    secondaryHref: '/support',
  },
};

function RtlDecorator({ children }: { readonly children: React.ReactNode }) {
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  args: {
    title: 'دعوة ختامية مشتركة',
    body: 'ملف واحد متكيف لكل إصدار.',
    ctaLabel: 'اطلب الوصول',
  },
  decorators: [
    function WithRtl(StoryComponent) {
      return (
        <RtlDecorator>
          <StoryComponent />
        </RtlDecorator>
      );
    },
  ],
};
