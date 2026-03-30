import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceUserCell } from '@/components/organisms/table';

describe('AudienceUserCell showTypeDot', () => {
  it('shows type dot for identified email member', () => {
    const { container } = render(
      <AudienceUserCell displayName='Jane Doe' type='email' showTypeDot />
    );
    // Type dot should render with title attribute
    const dot = container.querySelector('[title="Email"]');
    expect(dot).toBeInTheDocument();
  });

  it('does not show type dot for anonymous members even when showTypeDot is true', () => {
    const { container } = render(
      <AudienceUserCell
        displayName={null}
        type='anonymous'
        deviceType='mobile'
        showTypeDot
      />
    );
    // No type dot for anonymous
    const dot = container.querySelector('[title]');
    expect(dot).not.toBeInTheDocument();
  });

  it('does not show type dot when showTypeDot is false', () => {
    const { container } = render(
      <AudienceUserCell displayName='Jane Doe' type='email' />
    );
    const dot = container.querySelector('[title="Email"]');
    expect(dot).not.toBeInTheDocument();
  });
});
