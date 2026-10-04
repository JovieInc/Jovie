import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { HomepageLabelLogoMark } from './HomepageLabelLogoMark';

describe('HomepageLabelLogoMark', () => {
  it('renders nothing without a permission for the placement', () => {
    const { container } = render(
      <HomepageLabelLogoMark partner='awal' placement={{ page: '/' }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the mark when a grant covers the placement', () => {
    render(
      <HomepageLabelLogoMark
        partner='awal'
        placement={{ page: '/' }}
        fixturePermissions={LOGO_PERMISSION_FIXTURES}
      />
    );
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
  });
});
