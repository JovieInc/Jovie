import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingCenteredParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { MarketingTerminalCta } from './MarketingTerminalCta';

const meta = {
  title: 'Site/MarketingTerminalCta',
  component: MarketingTerminalCta,
  parameters: {
    ...marketingCenteredParameters,
    docs: {
      description: {
        component:
          'Shared production CTA primitive used by the canonical final and footer CTA wrappers. The supplied Pen contract remains a required identity boundary.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingTerminalCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  args: {
    title: 'A shared terminal call to action.',
    body: 'One adaptive profile for every drop.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
    testId: 'storybook-marketing-terminal-cta',
    penContractId: MARKETING_PEN_CONTRACT_IDS.shell.finalCta,
  },
};

export const CinematicWithSecondaryAction: Story = {
  args: {
    title: 'Turn every release into a front door.',
    body: 'Keep one clear path from the drop to the next action.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
    secondaryLabel: 'See pricing',
    secondaryHref: '/pricing',
    testId: 'storybook-marketing-terminal-cinematic',
    penContractId: MARKETING_PEN_CONTRACT_IDS.shell.footerCta,
    variant: 'cinematic',
  },
};
