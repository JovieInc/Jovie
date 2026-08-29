import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH } from '@/data/marketing/penContracts';
import {
  MarketingContainer,
  type MarketingContainerProps,
} from './MarketingContainer';

describe('MarketingContainer', () => {
  it.each([
    ['landing', 'max-w-public-content'],
    ['page', 'max-w-public-content'],
    ['prose', 'max-w-prose-canonical'],
  ] as const)('maps the %s width to its canonical container class', (width, widthClass) => {
    render(
      <MarketingContainer width={width}>
        <p>Container content</p>
      </MarketingContainer>
    );

    const wrapper = screen.getByText('Container content').parentElement;
    expect(wrapper).toHaveClass(
      'mx-auto',
      'w-full',
      'px-6',
      'sm:px-8',
      'lg:px-10',
      widthClass
    );
    expect(wrapper).toHaveAttribute(
      'data-pen-contract',
      MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH[width]
    );
  });

  it('keeps children and caller class hooks on the same centered wrapper', () => {
    render(
      <MarketingContainer width='page' className='marketing-container-hook'>
        <p>Page content</p>
      </MarketingContainer>
    );

    const wrapper = screen.getByText('Page content').parentElement;
    expect(wrapper).toHaveClass('marketing-container-hook');
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('requires the width and children contract at the type boundary', () => {
    const props: MarketingContainerProps = {
      width: 'prose',
      children: <span>Typed content</span>,
    };

    render(<MarketingContainer {...props} />);

    expect(screen.getByText('Typed content')).toBeInTheDocument();
  });
});
