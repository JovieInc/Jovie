import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceIdentificationIndicator } from './AudienceIdentificationIndicator';

describe('AudienceIdentificationIndicator', () => {
  it('labels a customer with an email as Identified', () => {
    const { container } = render(
      <AudienceIdentificationIndicator
        type='customer'
        hasEmail
        hasPhone={false}
        spotifyConnected={false}
      />
    );

    expect(screen.getByText('Identified')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveClass('lucide-circle-check');
  });

  it('labels a partially-identified member with the banned-icon-safe CircleAlert glyph', () => {
    const { container } = render(
      <AudienceIdentificationIndicator
        type='sms'
        hasEmail={false}
        hasPhone
        spotifyConnected={false}
      />
    );

    expect(screen.getByText('Partial')).toBeInTheDocument();
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('lucide-circle-alert');
    expect(icon).not.toHaveClass('lucide-circle-dot');
  });

  it('labels a fully anonymous member as Anonymous', () => {
    render(
      <AudienceIdentificationIndicator
        type='anonymous'
        hasEmail={false}
        hasPhone={false}
        spotifyConnected={false}
      />
    );

    expect(screen.getByText('Anonymous')).toBeInTheDocument();
  });
});

describe('AudienceIdentificationIndicator tokens', () => {
  it('uses the success token for identified and the warning token for partial, with no palette classes', () => {
    const identified = render(
      <AudienceIdentificationIndicator
        type='customer'
        hasEmail
        hasPhone={false}
        spotifyConnected={false}
      />
    );
    expect(identified.container.querySelector('svg')).toHaveClass(
      'text-success'
    );
    expect(screen.getByText('Identified')).toHaveClass('text-success-text');
    expect(identified.container.innerHTML).not.toMatch(/emerald|amber/);
    identified.unmount();

    const partial = render(
      <AudienceIdentificationIndicator
        type='sms'
        hasEmail={false}
        hasPhone
        spotifyConnected={false}
      />
    );
    expect(partial.container.querySelector('svg')).toHaveClass('text-warning');
    expect(screen.getByText('Partial')).toHaveClass('text-warning-text');
    expect(partial.container.innerHTML).not.toMatch(/emerald|amber/);
  });
});
