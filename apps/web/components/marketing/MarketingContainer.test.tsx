import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH } from '@/data/marketing/penContracts';
import { MarketingContainer } from './MarketingContainer';

describe('MarketingContainer', () => {
  it('centers page-width children on the canonical public-content token', () => {
    const { container } = render(
      <MarketingContainer width='page' className='py-16'>
        page column
      </MarketingContainer>
    );

    const wrapper = container.firstElementChild;
    expect(screen.getByText('page column')).toBeInTheDocument();
    expect(wrapper).toHaveClass(
      'mx-auto',
      'w-full',
      'max-w-public-content',
      'py-16'
    );
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.page
    );
  });

  it('keeps the landing alias on the same public-content token', () => {
    const { container } = render(
      <MarketingContainer width='landing'>landing column</MarketingContainer>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('max-w-public-content');
    expect(wrapper).not.toHaveClass('max-w-prose-canonical');
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.landing
    );
  });

  it('narrows prose-width children to the canonical reading column', () => {
    const { container } = render(
      <MarketingContainer width='prose'>prose column</MarketingContainer>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('max-w-prose-canonical');
    expect(wrapper).not.toHaveClass('max-w-public-content');
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.prose
    );
  });
});
