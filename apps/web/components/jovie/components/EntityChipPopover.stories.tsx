import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { AssistantMessageText } from './AssistantMessageText';
import { EntityChip } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';
import { SourceEvidenceProvider } from './SourceEvidence';
import { sourceFixture } from './source-evidence.fixtures';

const meta = {
  title: 'Jovie/EntityChipPopover',
  component: EntityChipPopover,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8'>
        <Story />
      </div>
    ),
  ],
  args: {
    kind: 'release',
    id: 'rel_1',
    label: 'Midnight Drive',
    children: (
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Midnight Drive' }}
        variant='transcript'
      />
    ),
  },
} satisfies Meta<typeof EntityChipPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unavailable: Story = {};

export const Renamed: Story = {
  args: {
    entity: { kind: 'release', id: 'rel_1', label: 'Current title' },
    children: (
      <EntityChip
        data={{ kind: 'release', id: 'rel_1', label: 'Current title' }}
        variant='transcript'
      />
    ),
  },
};

function SourceMatrix() {
  const direct = sourceFixture();
  const indirect = sourceFixture({
    ...direct,
    id: 'indirect',
    predicate: 'social.followers',
    unit: 'subscribers',
    value: { type: 'number', value: 2400 },
    sourceRefs: [
      {
        ...direct.sourceRefs[0],
        id: 'aggregator',
        kind: 'enrichment',
        provider: 'public catalog',
        url: 'https://example.com/catalog',
        originUrl: 'https://example.org/creator',
      },
    ],
  });
  const stale = sourceFixture({
    ...direct,
    id: 'stale',
    predicate: 'book.title',
    unit: null,
    value: { type: 'text', value: 'Earlier edition' },
    status: 'stale',
    sourceRefs: [
      {
        ...direct.sourceRefs[0],
        id: 'stale-source',
        url: 'https://example.com/book',
        fetchedAt: '2020-01-01T00:00:00.000Z',
        freshness: 'stale',
      },
    ],
  });
  const unknown = sourceFixture({
    ...direct,
    id: 'unknown',
    predicate: 'website.url',
    value: null,
    status: 'unknown',
    sourceRefs: [
      {
        ...direct.sourceRefs[0],
        id: 'unknown-source',
        url: 'https://example.com/unknown',
        fetchedAt: null,
      },
    ],
  });
  return (
    <SourceEvidenceProvider facts={[direct, indirect, stale, unknown]}>
      <div
        className='max-w-xl space-y-5 bg-base p-4 text-primary-token'
        data-testid='source-matrix'
      >
        <div className='overflow-hidden' data-testid='source-transcript'>
          <AssistantMessageText content='A long sentence that wraps before the source at its end: [Fixture Artist](https://open.spotify.com/artist/fixture) has 9.9K followers (source: enrichment). The catalog reports 2.4K subscribers. See [earlier book](https://example.com/book) and [unknown website](https://example.com/unknown). Ordinary prose and 42 guesses stay plain.' />
        </div>
        <textarea
          aria-label='Composer'
          defaultValue='Unsent draft'
          className='w-full bg-surface-1 text-primary-token'
        />
      </div>
    </SourceEvidenceProvider>
  );
}

export const SourceReferences: Story = { render: () => <SourceMatrix /> };

function SourceReceiptTransition() {
  const [receipt, setReceipt] = useState(0);
  const facts =
    receipt === 0
      ? []
      : [sourceFixture({ permission: receipt === 2 ? 'private' : 'public' })];
  return (
    <div className='w-80 space-y-4 bg-base p-3 text-primary-token'>
      <div data-testid='receipt-transcript'>
        <SourceEvidenceProvider facts={facts}>
          <AssistantMessageText
            content='Fixture Artist has 9.9K followers.'
            isStreaming={receipt === 0}
          />
        </SourceEvidenceProvider>
      </div>
      <textarea
        aria-label='Composer'
        defaultValue='Unsent draft'
        className='w-full bg-surface-1'
      />
      <button type='button' onClick={() => setReceipt(value => value + 1)}>
        Advance receipt
      </button>
    </div>
  );
}

export const ReceiptTransitions: Story = {
  render: () => <SourceReceiptTransition />,
};
