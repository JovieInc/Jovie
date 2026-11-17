// screen-cert-repair: generated
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ChatMerchSourceSelectionCard,
  ChatMerchZeroDesignCard,
  MERCH_ZERO_DESIGNS_TITLE,
} from './merch-tool-artifacts';

const mutateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  useConfirmChatMerchActionMutation: () => ({ mutate: mutateMock }),
}));

describe('ChatMerchSourceSelectionCard screen certificate', () => {
  it('shows the empty message', async () => {
    const { container } = render(
      <ChatMerchSourceSelectionCard
        message='Jovie could not find a confirmed catalog title. Add a title or provide a phrase you own before generating artwork.'
        candidates={[]}
      />
    );
    expect(
      screen.getByText(
        'Jovie could not find a confirmed catalog title. Add a title or provide a phrase you own before generating artwork.'
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows a partial card without the optional message', async () => {
    const { container } = render(<ChatMerchZeroDesignCard />);
    expect(screen.getByText(MERCH_ZERO_DESIGNS_TITLE)).toBeVisible();
    expect(
      screen.queryByText(
        'Choose a confirmed catalog phrase before Jovie generates any artwork.'
      )
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows a long catalog phrase', async () => {
    const { container } = render(
      <ChatMerchSourceSelectionCard
        message='Choose a confirmed catalog phrase before Jovie generates any artwork. and the rest of the confirmed catalog phrase'
        candidates={[]}
      />
    );
    expect(
      screen.getByText(
        'Choose a confirmed catalog phrase before Jovie generates any artwork. and the rest of the confirmed catalog phrase'
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows an Arabic phrase in an RTL transcript', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatMerchSourceSelectionCard
          message='اختر عبارة مؤكدة من الكتالوج قبل أن تنشئ أي عمل فني.'
          candidates={[]}
        />
      </div>
    );
    expect(
      screen.getByText('اختر عبارة مؤكدة من الكتالوج قبل أن تنشئ أي عمل فني.')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
