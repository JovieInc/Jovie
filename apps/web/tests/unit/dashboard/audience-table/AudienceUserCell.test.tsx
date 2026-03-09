import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceUserCell } from '@/components/dashboard/audience/table/atoms/AudienceUserCell';

describe('AudienceUserCell', () => {
  it('renders anonymous visitors with device and city label', () => {
    render(
      <AudienceUserCell
        displayName='Visitor'
        type='anonymous'
        deviceType='mobile'
        geoCity='London'
      />
    );

    expect(screen.getByText('Mobile visitor from London')).toBeInTheDocument();
  });

  it('falls back to device-only anonymous label when location is unavailable', () => {
    render(
      <AudienceUserCell
        displayName='Visitor'
        type='anonymous'
        deviceType='desktop'
      />
    );

    expect(screen.getByText('Desktop visitor')).toBeInTheDocument();
  });
});
