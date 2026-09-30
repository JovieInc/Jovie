import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  SolutionsRecordCta,
  SolutionsRecordFaq,
  SolutionsRecordFeatureSplit,
  SolutionsRecordHero,
} from './SolutionsRecordSections';

const meta = {
  title: 'Marketing/Solutions/RecordSections',
  component: SolutionsRecordHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Record-driven /solutions sections (JOV-7284). Each wraps the canonical section owner and renders only the copy and media a page record supplies. The specimen uses the factory founders fixture copy.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SolutionsRecordHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SplitClaimHero: Story = {
  args: {
    heroVariant: 'split-link-claim',
    copy: {
      headline: 'Claim your public profile',
      subhead:
        'Jovie gives founders one public page that turns visitors into subscribers you can reach again.',
    },
  },
};

export const RecordPage: Story = {
  args: SplitClaimHero.args,
  render: args => (
    <>
      <SolutionsRecordHero {...args} />
      <SolutionsRecordFeatureSplit
        instanceId='capture-1'
        copy={{
          headline: 'Visitors become subscribers',
          body: 'Visitors subscribe from your page. When you have news, they get a notification they opted into.',
        }}
        media={{
          kind: 'screenshot-registry',
          id: 'tim-white-profile-subscribe-mobile',
          alt: 'A Jovie profile with its subscribe action open.',
        }}
      />
      <SolutionsRecordFaq
        items={[{ question: 'Is it free?', answer: 'Yes, profiles are free.' }]}
      />
      <SolutionsRecordCta
        instanceId='cta-1'
        copy={{ headline: 'Start free. It costs $0.' }}
      />
    </>
  ),
};
