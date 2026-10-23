import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPhoneStateGallery } from './MarketingPhoneStateGallery';

const STATES = [
  {
    id: 'listen',
    scenarioId: 'tim-white-profile-listen-mobile',
    alt: "Tim White's Jovie profile showing his music catalog.",
    title: 'Listen',
    body: 'Fans land on the right release and the right platform without hunting through a stack of links.',
  },
  {
    id: 'show-up',
    scenarioId: 'tim-white-profile-tour-mobile',
    alt: "Tim White's Jovie profile showing upcoming shows with ticket links.",
    title: 'Show Up',
    body: 'Touring fans see the show that matters to them instead of scrolling through cities that do not.',
  },
  {
    id: 'stay-close',
    scenarioId: 'tim-white-profile-subscribe-mobile',
    alt: "Tim White's Jovie profile asking a fan to get updates by email.",
    title: 'Stay Close',
    body: 'A listen, a signup, or a support moment can become a real fan relationship instead of an anonymous click.',
  },
] as const;

const meta = {
  title: 'Marketing/MarketingPhoneStateGallery',
  component: MarketingPhoneStateGallery,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Product-gallery body: one real screenshot-registry capture per phone with a short caption. A grid on wide screens; a focusable scroll-snap rail on phones that never scrolls the page sideways.',
      },
    },
  },
  args: {
    states: STATES,
    label: 'Profile states',
  },
} satisfies Meta<typeof MarketingPhoneStateGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeStates: Story = {};

export const TwoStates: Story = {
  args: { states: STATES.slice(0, 2) },
};

export const Mobile: Story = {
  tags: ['mobile-viewport'],
  parameters: {
    viewport: { defaultViewport: 'mobile' },
    chromatic: { disable: true },
  },
};
