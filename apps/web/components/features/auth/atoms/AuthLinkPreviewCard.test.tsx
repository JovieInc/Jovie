import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthLinkPreviewCard } from './AuthLinkPreviewCard';

describe('AuthLinkPreviewCard certificate', () => {
  it('renders the label and the address without a trailing slot', async () => {
    const { container } = render(
      <AuthLinkPreviewCard
        label='Your profile is live at'
        hrefText='jov.ie/tim'
      />
    );

    expect(screen.getByText('Your profile is live at')).toBeInTheDocument();
    const address = screen.getByText('jov.ie/tim');
    expect(address).toHaveClass('break-all');
    expect(address.parentElement?.children).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders a trailing node beside the address', async () => {
    const { container } = render(
      <AuthLinkPreviewCard
        label='Your profile is live at'
        hrefText='jov.ie/tim'
        trailing={<span>Copied</span>}
      />
    );

    expect(screen.getByText('Copied').parentElement).toHaveClass('shrink-0');
    await expectNoA11yViolations(container);
  });

  it('keeps the label with an empty address and merges a caller class', async () => {
    const { container } = render(
      <AuthLinkPreviewCard label='Pick a handle' hrefText='' className='mt-4' />
    );

    expect(screen.getByText('Pick a handle')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('mt-4', 'rounded-lg');
    await expectNoA11yViolations(container);
  });

  it('renders long and RTL copy whole', async () => {
    const long = 'jov.ie/the-extremely-long-artist-handle-that-keeps-going-on';
    const { container } = render(
      <div dir='rtl'>
        <AuthLinkPreviewCard label='ملفك متاح الآن على' hrefText={long} />
      </div>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText('ملفك متاح الآن على')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
