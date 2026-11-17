import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH } from '@/data/marketing/penContracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingContainer } from './MarketingContainer';

describe('MarketingContainer', async () => {
  it('centers page-width children on the canonical public-content token', async () => {
    const { container } = render(
      <MarketingContainer width='page' className='py-16'>
        page column
      </MarketingContainer>
    );

    const wrapper = container.firstElementChild;
    expect(screen.getByText('page column')).toBeInTheDocument();
    expect(wrapper).toHaveClass('public-container', 'py-16');
    expect(wrapper).not.toHaveClass('public-container--bleed');
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.page
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the landing alias on the same public-content token', async () => {
    const { container } = render(
      <MarketingContainer width='landing'>landing column</MarketingContainer>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('public-container');
    expect(wrapper).not.toHaveClass('max-w-prose-canonical');
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.landing
    );
    await expectNoA11yViolations(container);
  });

  it('narrows prose-width children to the canonical reading column', async () => {
    const { container } = render(
      <MarketingContainer width='prose'>prose column</MarketingContainer>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('max-w-prose-canonical');
    expect(wrapper).not.toHaveClass('public-container');
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.prose
    );
    await expectNoA11yViolations(container);
  });

  it('offers one full-bleed override and no other width', async () => {
    const { container } = render(
      <MarketingContainer width='page' bleed>
        bleed column
      </MarketingContainer>
    );

    expect(container.firstElementChild).toHaveClass(
      'public-container',
      'public-container--bleed'
    );
    await expectNoA11yViolations(container);
  });

  it('lets long unbroken copy and right-to-left children sit in the column', async () => {
    const { container } = render(
      <MarketingContainer width='prose'>
        <p dir='rtl' lang='ar'>
          منصة جوفي تساعد الفنانين المستقلين على تحويل المعجبين إلى مستمعين
          دائمين
        </p>
        <p>{'Supercalifragilisticexpialidocious'.repeat(6)}</p>
      </MarketingContainer>
    );

    expect(container.querySelector('[dir="rtl"]')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
